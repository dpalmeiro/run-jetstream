# run-jetstream

JetStream 3 runner for JavaScript shells. This package intentionally does not
host a benchmark server or launch browsers; it runs `jetstream/cli.js` directly
under SpiderMonkey or V8.

## Setup

```sh
npm install
npm run build
npm link
```

The benchmark source is cloned in `jetstream/`.
The SpiderMonkey claudometer configs include a `mozconfig` override for
`claudometer optimize` that builds the JS shell with
`ac_add_options --enable-application=js` into `obj-js`.

`configs/` contains full-suite configs plus one config per default JetStream 3
workload for both SpiderMonkey and V8. Per-workload configs use 100 JetStream
iterations, e.g. `configs/js3-proxy-mobx-spidermonkey.json`.

## Running

```sh
run-jetstream --spidermonkey /path/to/js --iterations 17
run-jetstream --v8 /path/to/v8 --iterations 17
run-jetstream --v8 /path/to/v8 --iterations 100 --test proxy-mobx
```

The wrapper handles the shell calling convention:

- SpiderMonkey: `js cli.js --iteration-count=17 ...`
- V8: `v8 cli.js -- --iteration-count=17 ...`

JetStream constructs every workload before applying test filters, so the global
iteration count must exceed the largest built-in worst-case count. Use at least
17 unless you are running a patched JetStream checkout.

Extra shell flags go before `cli.js`:

```sh
run-jetstream --v8 /path/to/v8 --shell-arg=--trace-opt --test proxy-mobx
```

Extra JetStream flags go after `cli.js`:

```sh
run-jetstream --spidermonkey /path/to/js --jetstream-arg=--no-prefetch
```

## Profiling

To let the runner invoke samply:

```sh
run-jetstream --spidermonkey /path/to/js --test proxy-mobx --samply sm.json.gz
run-jetstream --v8 /path/to/v8 --test proxy-mobx --samply v8.json.gz
```

For claudometer-style profiling, where the binary is already replaced by a
samply wrapper, use `--profile-shell`. This enables the shell-specific profiling
flags and environment without invoking samply inside `run-jetstream`.

V8 profile runs add `--perf-prof --interpreted-frames-native-stack`. SpiderMonkey
profile runs set the same JIT/perf environment claudometer uses for Firefox runs.
