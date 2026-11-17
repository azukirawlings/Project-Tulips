//go:build !windows

package main

import "os/exec"

func prepareConsole() {}

func openBrowser(url string) {
	cmd := exec.Command("xdg-open", url)
	_ = cmd.Start()
}
