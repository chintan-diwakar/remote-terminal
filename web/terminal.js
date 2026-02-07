(function () {
  'use strict';

  var RECONNECT_DELAY = 2000;
  var ws = null;
  var term = null;
  var fitAddon = null;

  function init() {
    term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Cascadia Code", "Fira Code", Consolas, monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#e94560',
        selectionBackground: '#264f78',
        black: '#1a1a2e',
        red: '#e94560',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e0e0e0',
        brightBlack: '#4a4a6a',
        brightRed: '#ff6b8a',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon.FitAddon();
    var webLinksAddon = new WebLinksAddon.WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    var container = document.getElementById('terminal-container');
    term.open(container);
    fitAddon.fit();

    // Fetch workspace info
    fetch('/api/info')
      .then(function (r) { return r.json(); })
      .then(function (info) {
        document.getElementById('workspace-path').textContent = info.workspace;
      })
      .catch(function () { /* ignore */ });

    connect();

    // Handle resize
    window.addEventListener('resize', function () {
      if (fitAddon) {
        fitAddon.fit();
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    // Focus terminal on click
    container.addEventListener('click', function () {
      term.focus();
    });
  }

  function setStatus(state, text) {
    var el = document.getElementById('connection-status');
    el.textContent = text;
    el.className = 'status ' + state;
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + location.host + '/ws/terminal';

    ws = new WebSocket(url);

    ws.onopen = function () {
      setStatus('connected', 'connected');
      // Send initial size
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = function (event) {
      term.write(event.data);
    };

    ws.onclose = function () {
      setStatus('disconnected', 'disconnected');
      term.write('\r\n\x1b[31m[Connection lost. Reconnecting...]\x1b[0m\r\n');
      setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = function () {
      // onclose will fire after this
    };

    // Terminal input -> WebSocket
    term.onData(function (data) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
