import { networkInterfaces } from 'node:os';

// Interfaces virtuales habituales en Windows/WSL/Docker que el teléfono no puede alcanzar.
const VIRTUAL = /(vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|tailscale|zerotier|bluetooth)/i;

/** IPv4 privadas del equipo, primero las físicas y las de rango doméstico 192.168.x.x. */
export function lanCandidates() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
      out.push({ name, address: a.address, virtual: VIRTUAL.test(name) });
    }
  }
  return out.sort(
    (a, b) =>
      Number(a.virtual) - Number(b.virtual) ||
      Number(!a.address.startsWith('192.168.')) - Number(!b.address.startsWith('192.168.')),
  );
}

export function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}
