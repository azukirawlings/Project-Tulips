//go:build windows

package main

import (
	"os/exec"
	"syscall"
	"unsafe"
)

func prepareConsole() {
	kernel := syscall.NewLazyDLL("kernel32.dll")
	kernel.NewProc("SetConsoleOutputCP").Call(65001)
	kernel.NewProc("SetConsoleCP").Call(65001)
	title, err := syscall.UTF16PtrFromString("Project Tulip")
	if err == nil {
		kernel.NewProc("SetConsoleTitleW").Call(uintptr(unsafe.Pointer(title)))
	}
}

func openBrowser(url string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	_ = cmd.Start()
}
