import json, io
from playwright.sync_api import sync_playwright
from PIL import Image
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
BG=(240,238,231)

def new_page(b, project=None):
    ctx=b.new_context(viewport={"width":1440,"height":1000}, accept_downloads=True)
    pg=ctx.new_page(); pg.errs=[]; pg.bad=[]
    pg.on("dialog",lambda d:d.accept())
    pg.on("console",lambda m: pg.errs.append((m.type,m.text)) if m.type=="error" else None)
    pg.on("pageerror",lambda e: pg.errs.append(("pageerror",str(e))))
    pg.on("response",lambda r: pg.bad.append((r.status,r.url)) if r.status>=400 else None)
    pg.goto("http://127.0.0.1:4173/"); pg.wait_for_timeout(600)
    if project:
        pg.set_input_files("#import",project); pg.wait_for_timeout(700)
    return pg

def artboard(pg):
    box=pg.locator("canvas").bounding_box()
    im=Image.open(io.BytesIO(pg.screenshot(clip=box))).convert("RGB")
    W,H=im.size; px=im.load(); xs=[];ys=[]
    for y in range(0,H,2):
        for x in range(0,W,2):
            r,g,b=px[x,y]
            if abs(r-BG[0])<5 and abs(g-BG[1])<5 and abs(b-BG[2])<5: xs.append(x);ys.append(y)
    x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
    return box["x"]+x0, box["y"]+y0, (x1-x0)/1280.0

def to_screen(pg,cx,cy):
    ax,ay,s=artboard(pg); return ax+cx*s, ay+cy*s

def export_state(pg):
    with pg.expect_download() as d: pg.click("#export")
    return json.loads(open(d.value.path()).read())

def comp(pg): return export_state(pg)["compositions"][0]
def find_layer(layers,i):
    for l in layers:
        if l["id"]==i: return l
        r=find_layer(l.get("children",[]),i)
        if r: return r
def val(p): return p["value"]

def ruler_click(pg,sec):
    r=pg.locator(".timeline-ruler").bounding_box()
    pg.mouse.click(r["x"]+sec*80, r["y"]+8); pg.wait_for_timeout(200)
def timecode(pg): return pg.inner_text(".transport-composition")
