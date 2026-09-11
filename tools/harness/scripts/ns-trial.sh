#!/bin/sh
# Run one trial inside a rootless Linux namespace set, and report what the
# namespaces actually established.
#
# ADR-0005 left `process` and `network` unproven at Stage 0 and said so plainly:
# a temporary directory cannot constrain either, and proving them "needs a
# container, namespace or equivalent mechanism, which is a Stage 3
# precondition". This is that mechanism.
#
# The important property is that this script does not *claim* boundaries. It
# builds them and then observes them from inside, writing what it saw to the
# report file: how many entries are visible where a denied root sits on the host,
# whether a control destination could be reached, whether the trial is pid 1.
# The TypeScript side turns those observations into boundary findings, so a step
# that silently failed produces an observation contradicting it rather than an
# absence that reads like success.
#
# Usage:
#   ns-trial.sh --report FILE --node-bin PATH [--allow-host HOST:PORT]...
#               [--deny-root DIR]... [--control-host IP:PORT] -- COMMAND...
#
# Exits with the command's own status, except 64 for a usage error and 69 when a
# required mechanism is missing -- a machine without the namespace tooling fails
# here rather than running an unisolated trial that would look identical in the
# report.
set -e

REPORT=""
NODE_BIN=""
ALLOW_HOSTS=""
DENY_ROOTS=""
CONTROL_HOST="93.184.216.34:443"

while [ $# -gt 0 ]; do
  case "$1" in
    --report) REPORT="$2"; shift 2 ;;
    --node-bin) NODE_BIN="$2"; shift 2 ;;
    --allow-host) ALLOW_HOSTS="$ALLOW_HOSTS $2"; shift 2 ;;
    --deny-root) DENY_ROOTS="$DENY_ROOTS $2"; shift 2 ;;
    --control-host) CONTROL_HOST="$2"; shift 2 ;;
    --) shift; break ;;
    *) echo "ns-trial.sh: unexpected argument $1" >&2; exit 64 ;;
  esac
done

[ -n "$REPORT" ] || { echo "ns-trial.sh: --report is required" >&2; exit 64; }
[ -n "$NODE_BIN" ] || { echo "ns-trial.sh: --node-bin is required" >&2; exit 64; }
[ $# -gt 0 ] || { echo "ns-trial.sh: no command given" >&2; exit 64; }

PATH="$PATH:/usr/sbin:/sbin"
export PATH
for tool in slirp4netns ip iptables unshare; do
  command -v "$tool" >/dev/null || {
    echo "ns-trial.sh: $tool is not installed; refusing to run an unisolated trial" >&2
    exit 69
  }
done

# Resolved on the host, before any namespace exists: inside there is deliberately
# no DNS to resolve it with. IPv4 only -- slirp4netns provides no IPv6 egress, so
# an allowlist naming an IPv6 address would be a rule that never matches.
ALLOW_RULES=""
ALLOW_RECORD=""
for entry in $ALLOW_HOSTS; do
  host=$(echo "$entry" | cut -d: -f1)
  port=$(echo "$entry" | cut -d: -f2)
  for addr in $(getent ahostsv4 "$host" | awk '{print $1}' | sort -u); do
    ALLOW_RULES="$ALLOW_RULES $addr:$port"
    ALLOW_RECORD="$ALLOW_RECORD $host($addr):$port"
  done
done

T=$(mktemp -d)
cleanup() { rm -rf "$T"; }
trap cleanup EXIT

mkdir -p "$T/empty"
READY="$T/ready"; GO="$T/go"; SLIRP_READY="$T/slirp"
mkfifo "$READY" "$GO" "$SLIRP_READY"

# The inner stage is a file rather than an inline `sh -c` string. Three levels of
# nested quoting is how a setup step silently becomes a no-op, and a no-op here
# would mean an unisolated trial reporting itself as isolated.
cat > "$T/inner.sh" <<'INNER'
#!/bin/sh
set -e
echo up > "$NS_READY"
read _ < "$NS_GO"
PATH="$PATH:/usr/sbin:/sbin"

# A denied root is not merely unreachable-by-check: an empty directory is mounted
# over it, so inside this namespace it does not exist. That is "evaluator/ never
# mounted" as a fact about the filesystem rather than a convention about callers.
for root in $NS_DENY_ROOTS; do
  if [ -d "$root" ]; then mount --bind "$NS_EMPTY" "$root"; fi
done

iptables -P OUTPUT DROP
iptables -A OUTPUT -o lo -j ACCEPT
for rule in $NS_ALLOW_RULES; do
  addr=$(echo "$rule" | cut -d: -f1)
  port=$(echo "$rule" | cut -d: -f2)
  iptables -A OUTPUT -d "$addr" -p tcp --dport "$port" -j ACCEPT
done

denied_visible=0
for root in $NS_DENY_ROOTS; do
  if [ -d "$root" ]; then
    denied_visible=$((denied_visible + $(ls -A "$root" 2>/dev/null | wc -l)))
  fi
done

control=$("$NS_NODE_BIN" -e '
  const net = require("node:net");
  const [host, port] = process.argv.slice(1);
  const socket = net.connect({ host, port: Number(port) });
  socket.setTimeout(4000);
  const say = (verdict) => { process.stdout.write(verdict); socket.destroy(); };
  socket.on("connect", () => say("reached"));
  socket.on("timeout", () => say("refused:timeout"));
  socket.on("error", (error) => say("refused:" + String(error.code)));
' "$NS_CONTROL_IP" "$NS_CONTROL_PORT" 2>/dev/null || echo "refused:spawn")

interfaces=$(ip -o link show | awk -F': ' '{print $2}' | tr '\n' ',' | sed 's/,$//')
pid_report=$(unshare --pid --fork --mount-proc /bin/sh -c 'printf "%s %s" "$$" "$(ls /proc | grep -c "^[0-9]")"')

cat > "$NS_REPORT" <<REPORTJSON
{
  "denied_roots": "$NS_DENY_ROOTS",
  "denied_entries_visible": $denied_visible,
  "allowlist": "$NS_ALLOW_RECORD",
  "control_host": "$NS_CONTROL_IP:$NS_CONTROL_PORT",
  "control_result": "$control",
  "interfaces": "$interfaces",
  "pid_namespace_self": $(echo "$pid_report" | cut -d' ' -f1),
  "pid_namespace_visible_processes": $(echo "$pid_report" | cut -d' ' -f2)
}
REPORTJSON

# The trial itself: its own PID namespace, so it is pid 1 and sees only the
# process tree it creates.
exec unshare --pid --fork --mount-proc "$@"
INNER
chmod +x "$T/inner.sh"

NS_READY="$READY" NS_GO="$GO" NS_EMPTY="$T/empty" NS_REPORT="$REPORT" \
NS_DENY_ROOTS="$DENY_ROOTS" NS_ALLOW_RULES="$ALLOW_RULES" NS_ALLOW_RECORD="$ALLOW_RECORD" \
NS_NODE_BIN="$NODE_BIN" NS_CONTROL_IP="$(echo "$CONTROL_HOST" | cut -d: -f1)" \
NS_CONTROL_PORT="$(echo "$CONTROL_HOST" | cut -d: -f2)" \
  unshare --user --map-root-user --net --mount --propagation private \
    /bin/sh "$T/inner.sh" "$@" &
NSPID=$!

# A failed inner stage must not leave the host blocked on a pipe nobody will
# write to, so the wait for each handshake is bounded and says which step stalled.
( sleep 20; echo stalled > "$READY" 2>/dev/null ) & GUARD_READY=$!
read namespace_up < "$READY"
kill "$GUARD_READY" 2>/dev/null || true
[ "$namespace_up" = "up" ] || {
  echo "ns-trial.sh: the namespace stage never started" >&2
  exit 69
}

slirp4netns --configure --mtu=65520 --ready-fd=3 "$NSPID" tap0 >/dev/null 2>"$T/slirp.err" 3>"$SLIRP_READY" &
SLIRP=$!
( sleep 20; echo stalled > "$SLIRP_READY" 2>/dev/null ) & GUARD_SLIRP=$!
slirp_up=""
read slirp_up < "$SLIRP_READY" || true
kill "$GUARD_SLIRP" 2>/dev/null || true
[ "$slirp_up" = "1" ] || {
  kill "$SLIRP" 2>/dev/null || true
  echo "ns-trial.sh: slirp4netns never reported ready, so egress was never configured" >&2
  echo "ns-trial.sh: slirp4netns said: $(cat "$T/slirp.err" 2>/dev/null | tr '\n' ' ')" >&2
  exit 69
}

echo go > "$GO"
STATUS=0
wait "$NSPID" || STATUS=$?
kill "$SLIRP" 2>/dev/null || true
exit "$STATUS"
