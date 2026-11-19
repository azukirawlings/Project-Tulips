package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed all:dist
var embedded embed.FS

const port = 39241

type peer struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	LastSeen time.Time
}

type signal struct {
	ID      int64       `json:"id"`
	From    string      `json:"from"`
	Kind    string      `json:"kind"`
	Payload interface{} `json:"payload"`
}

var (
	sigMu   sync.Mutex
	rooms   = map[string]map[string]*peer{}
	signals = map[string][]signal{}
	nextSig int64
)

func main() {
	prepareConsole()
	_ = mime.AddExtensionType(".js", "text/javascript")
	_ = mime.AddExtensionType(".mjs", "text/javascript")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".css", "text/css")

	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		fmt.Println("Project Tulip 已经在运行，正在打开浏览器。")
		url := fmt.Sprintf("http://127.0.0.1:%d/", port)
		fmt.Println(url)
		openBrowser(url)
		fmt.Println("按回车键关闭此窗口。")
		_, _ = fmt.Scanln()
		return
	}

	sub, err := fs.Sub(embedded, "dist")
	if err != nil {
		fmt.Println("启动失败：程序里没有地图页面。")
		fmt.Println(err)
		return
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/rtc", rtcHandler)
	mux.Handle("/", spaHandler(sub))

	server := &http.Server{Handler: withCORS(mux)}
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	fmt.Println("Project Tulip 已启动。")
	fmt.Println("本机访问：", url)
	fmt.Println("其他设备可通过本机局域网 IP 访问同一端口进行协作。")
	fmt.Println("关闭此窗口即可退出。")
	openBrowser(url)
	if err := server.Serve(ln); err != nil && err != http.ErrServerClosed {
		fmt.Println("启动失败：", err)
		os.Exit(1)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func rtcHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	room := r.URL.Query().Get("room")
	if room == "" {
		http.Error(w, `{"error":"room required"}`, http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		sinceStr := r.URL.Query().Get("since")
		since, _ := strconv.ParseInt(sinceStr, 10, 64)
		peerID := r.URL.Query().Get("peer")
		name := r.URL.Query().Get("name")

		sigMu.Lock()
		if rooms[room] == nil {
			rooms[room] = map[string]*peer{}
		}
		if peerID != "" {
			rooms[room][peerID] = &peer{ID: peerID, Name: name, LastSeen: time.Now()}
		}
		now := time.Now()
		for id, p := range rooms[room] {
			if now.Sub(p.LastSeen) > 60*time.Second {
				delete(rooms[room], id)
			}
		}
		var peerList []peer
		for _, p := range rooms[room] {
			peerList = append(peerList, *p)
		}
		var newSigs []signal
		for _, s := range signals[room] {
			if s.ID > since {
				newSigs = append(newSigs, s)
			}
		}
		sigMu.Unlock()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"peers":   peerList,
			"signals": newSigs,
		})

	case http.MethodPost:
		var body struct {
			Op      string      `json:"op"`
			Room    string      `json:"room"`
			From    string      `json:"from"`
			To      string      `json:"to"`
			Kind    string      `json:"kind"`
			Payload interface{} `json:"payload"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"bad json"}`, http.StatusBadRequest)
			return
		}
		if body.Op == "signal" && body.Kind != "" {
			sigMu.Lock()
			nextSig++
			s := signal{
				ID:      nextSig,
				From:    body.From,
				Kind:    body.Kind,
				Payload: body.Payload,
			}
			signals[body.Room] = append(signals[body.Room], s)
			if len(signals[body.Room]) > 200 {
				signals[body.Room] = signals[body.Room][len(signals[body.Room])-200:]
			}
			sigMu.Unlock()
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func spaHandler(content fs.FS) http.Handler {
	files := http.FileServer(http.FS(content))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		clean := path.Clean("/" + r.URL.Path)
		name := strings.TrimPrefix(clean, "/")
		if name != "" && !strings.Contains(name, "..") {
			if file, err := content.Open(name); err == nil {
				stat, statErr := file.Stat()
				_ = file.Close()
				if statErr == nil && !stat.IsDir() {
					if strings.HasPrefix(name, "assets/") {
						w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
					}
					r.URL.Path = clean
					files.ServeHTTP(w, r)
					return
				}
			}
		}
		w.Header().Set("Cache-Control", "no-cache")
		body, err := fs.ReadFile(content, "index.html")
		if err != nil {
			http.Error(w, "missing index", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.Method == http.MethodHead {
			return
		}
		_, _ = io.WriteString(w, string(body))
	})
}
