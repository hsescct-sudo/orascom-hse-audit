"""Reads the state of the app's page through WebView remote debugging (debug builds only)."""
import json, sys, urllib.request
import websocket

out = {}
try:
    pages = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json', timeout=10))
    out['pages'] = [{k: p.get(k) for k in ('type', 'url', 'title')} for p in pages]
    page = next((p for p in pages if p.get('type') == 'page'), None)
    if page:
        ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30, suppress_origin=True)
        n = [0]
        def ev(expr):
            n[0] += 1
            ws.send(json.dumps({'id': n[0], 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
            while True:
                m = json.loads(ws.recv())
                if m.get('id') == n[0]:
                    r = m.get('result', {})
                    return r.get('result', {}).get('value', r.get('exceptionDetails', {}).get('text'))
        for key, expr in [
            ('href', 'location.href'), ('ready', 'document.readyState'), ('title', 'document.title'),
            ('text', 'document.body ? document.body.innerText.slice(0, 800) : null'),
            ('ua', 'navigator.userAgent'), ('bridge', 'typeof HSEAndroid'),
            ('sw', 'navigator.serviceWorker && navigator.serviceWorker.controller ? "controlled" : "none"'),
            ('resources', 'performance.getEntriesByType("resource").map(e => Math.round(e.duration) + "ms " + e.name.slice(0, 110))'),
        ]:
            out[key] = ev(expr)
        if len(sys.argv) > 1:
            out['extra'] = ev(sys.argv[1])
except Exception as e:
    out['error'] = repr(e)
print(json.dumps(out, indent=1, ensure_ascii=False))
