import json

with open('login.html', 'r', encoding='utf-8') as f:
    login = f.read()
with open('open-account.html', 'r', encoding='utf-8') as f:
    openacc = f.read()

# Intercept navigation between pages and forward to parent wrapper via postMessage
login = login.replace(
    "onclick=\"location.href='open-account.html'\"",
    "onclick=\"parent.postMessage('open-account','*')\""
)
login = login.replace(
    "onclick=\"window.location.href='trading.html'\"",
    "onclick=\"alert('Trading App page is not included in this demo.')\""
)
openacc = openacc.replace(
    "window.location.href = 'login.html'",
    "parent.postMessage('login','*')"
)
openacc = openacc.replace(
    "window.location.href = 'trading.html'",
    "alert('Trading App page is not included in this demo.')"
)

wrapper = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ALPEXA SUISSE</title>
<style>
html,body{margin:0;padding:0;height:100%;background:#fff;}
#frame{width:100%;height:100vh;border:none;display:block;}
</style>
</head>
<body>
<iframe id="frame"></iframe>
<script>
const PAGES = {
  "login": __LOGIN__,
  "open-account": __OPENACC__
};
const frame = document.getElementById('frame');
function show(page){ frame.srcdoc = PAGES[page] || PAGES.login; }
window.addEventListener('message', function(e){ if (PAGES[e.data]) show(e.data); });
show('login');
</script>
</body>
</html>
"""

login_js = json.dumps(login).replace('</script>', '<\\/script>')
openacc_js = json.dumps(openacc).replace('</script>', '<\\/script>')
wrapper = wrapper.replace("__LOGIN__", login_js)
wrapper = wrapper.replace("__OPENACC__", openacc_js)

with open('alpexa-app.html', 'w', encoding='utf-8') as f:
    f.write(wrapper)

print("Wrote alpexa-app.html")
