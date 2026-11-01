// Preloaded into every spawned CLI in tests. Any attempt to open a network connection
// fails the process with exit code 99 and a marker on stderr (network guard, invariant I1).
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const fail = (what) => {
  process.stderr.write(`NETWORK_ATTEMPT_BLOCKED:${what}\n`);
  process.exit(99);
};
globalThis.fetch = () => fail("fetch");
net.connect = net.createConnection = () => fail("net.connect");
net.Socket.prototype.connect = () => fail("socket.connect");
tls.connect = () => fail("tls.connect");
http.request = http.get = () => fail("http.request");
https.request = https.get = () => fail("https.request");
dns.lookup = () => fail("dns.lookup");
dns.promises.lookup = () => fail("dns.promises.lookup");
