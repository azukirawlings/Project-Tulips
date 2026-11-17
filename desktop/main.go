package main

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"strings"
)

//go:embed all:dist
var embedded embed.FS

const port = 39241

func main() {
	prepareConsole()
	_ = mime.AddExtensionType(".js", "text/javascript")
	_ = mime.AddExtensionType(".mjs", "text/javascript")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".css", "text/css")

	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		fmt.Println("阵图已经在运行，正在打开浏览器。")
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

	server := &http.Server{Handler: spaHandler(sub)}
	fmt.Println("阵图已启动。")
	fmt.Println("已在浏览器中打开。关闭此窗口即可退出。")
	fmt.Println(url)
	openBrowser(url)
	if err := server.Serve(ln); err != nil && err != http.ErrServerClosed {
		fmt.Println("启动失败：", err)
		os.Exit(1)
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
