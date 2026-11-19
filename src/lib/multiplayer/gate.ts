let open = true;

export function setCollabWrite(ok: boolean) {
  open = ok;
}

export function collabWriteOk() {
  return open;
}
