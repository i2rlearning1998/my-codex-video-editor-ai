"""Reference tests (Python + Playwright) written by Claude on 2026-09-20 against the T3 production build.
They show WORKING selectors, mouse coordinates and how to read state. Port the needed checks to TypeScript Playwright tests.
They are documentation, not part of the test suite. State was read via the app Export JSON button; in the real suite use the read-only test hook instead
(clicking Export moves keyboard focus away from the timeline and disables its shortcuts)."""
import sys, math, traceback, json, re, os
sys.path.insert(0,"/tmp")
from lib import *
NLE="/home/claude/nle-fixture.json"
os.makedirs("/tmp/shots",exist_ok=True)
open("/tmp/bad.json","w").write('{"hello": 1}')
open("/tmp/notjson.json","w").write('this is not json')
RES={}
def drag(pg,x0,y0,x1,y1,steps=12,mods=()):
    for m in mods: pg.keyboard.down(m)
    pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move(x1,y1,steps=steps); pg.mouse.up()
    for m in mods: pg.keyboard.up(m)
    pg.wait_for_timeout(250)
def bbox(pg,sel): return pg.locator(sel).first.bounding_box()
def clipbox(pg,cid): return bbox(pg,f'[data-clip-id="{cid}"]')
def clips(pg):
    c=comp(pg); out={}
    for t in c["tracks"]:
        for k in t["clips"]: out[k["id"]]=dict(track=t["id"],start=k["startTime"],dur=k["duration"],sin=k["sourceIn"],sout=k["sourceOut"])
    return out
def layer(pg,i): return find_layer(comp(pg)["layers"],i)
def pos(l): return val(l["transform"]["position"])
def sc(l): return val(l["transform"]["scale"])
def rot(l): return val(l["transform"]["rotation"])
def pressed(pg): return sorted(e.split("\n")[-1] for e in pg.evaluate("[...document.querySelectorAll('.scene-row[aria-pressed=true]')].map(e=>e.innerText)"))
def approx(a,b,t=1.5): return abs(a-b)<=t
def close(pg): pg.context.close()
def T(id_):
    def deco(f):
        def run(b):
            try:
                d=f(b); RES[id_]=("PASS",d or "")
            except AssertionError as e: RES[id_]=("FAIL",str(e))
            except Exception as e: RES[id_]=("ERROR",repr(e)[:300]+" "+traceback.format_exc().splitlines()[-3][:120])
        run.id=id_; TESTS.append(run); return run
    return deco
TESTS=[]
def select_intro(pg):
    ruler_click(pg,1.5); x,y=to_screen(pg,300,210); pg.mouse.click(x,y); pg.wait_for_timeout(250)

@T("APP-004")
def _(b):
    pg=new_page(b); n0=pg.inner_text("#project-name")
    pg.set_input_files("#import",NLE); pg.wait_for_timeout(700)
    assert pg.inner_text("#project-name")=="NLE Fixture","valid project did not replace session"
    pg.close(); pg=new_page(b); before=pg.inner_text("#project-name")
    msgs=[]
    for f in ["/tmp/bad.json","/tmp/notjson.json"]:
        pg.set_input_files("#import",f); pg.wait_for_timeout(600)
        assert pg.inner_text("#project-name")==before,"invalid file changed the session: "+f
        msgs.append(pg.inner_text("body").split("\n")[-6:])
    txt=" ".join(" ".join(m) for m in msgs)
    assert re.search(r"[Oo]pen failed|[Ii]nvalid|error",txt),"no visible error message for invalid file. footer: "+str(msgs[-1])
    return "valid opens; invalid rejected with message"

@T("APP-005")
def _(b):
    pg=new_page(b,NLE)
    with pg.expect_download() as d: pg.click("#export")
    data=json.loads(open(d.value.path()).read())
    assert d.value.suggested_filename.endswith(".json")
    assert data["schemaVersion"]==4 and data["compositions"][0]["tracks"]
    return f"downloaded {d.value.suggested_filename}, schema {data['schemaVersion']}"

@T("PRJ-009")
def _(b):
    pg=new_page(b,NLE); select_intro(pg)
    pg.fill("[aria-label='Position X']","333"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2500)
    pg.reload(); pg.wait_for_timeout(800)
    assert pg.inner_text("#project-name")=="NLE Fixture","project not restored after reload"
    assert approx(pos(layer(pg,"layer-a"))[0],333,0.01),f"edit lost: x={pos(layer(pg,'layer-a'))[0]}"
    return "edit and project survived reload"

@T("MED-014")
def _(b):
    pg=new_page(b,NLE)
    tgt=bbox(pg,'.timeline-track[data-track-id="video-3"]')
    src=pg.get_by_text("Footage 1080p").first
    before=len(clips(pg)); src.drag_to(pg.locator('.timeline-track[data-track-id="video-3"]'),target_position={"x":60,"y":8}); pg.wait_for_timeout(500)
    after=clips(pg); assert len(after)==before+1,f"drop did not create a clip ({before}->{len(after)})"
    new=[k for k,v in after.items() if v["track"]=="video-3"]; assert new,"clip not on target track"
    # locked track rejects
    pg.click('[data-action="track-lock"][data-id="video-2"]'); n=len(clips(pg)); pg.click("#save"); pg.wait_for_timeout(200); s0=pg.inner_text("#status")
    seen=[]
    pg.get_by_text("Landscape photo").first.drag_to(pg.locator('.timeline-track[data-track-id="video-2"]'),target_position={"x":300,"y":8})
    for _ in range(12): seen.append(pg.inner_text("#status")); pg.wait_for_timeout(50)
    assert any(re.search("lock",x,re.I) for x in seen),f"no visible feedback on rejected drop; status samples {sorted(set(seen))}"
    assert len(clips(pg))==n,"locked track accepted a drop"
    return "drop creates clip; locked track rejects the drop"

@T("CV-001")
def _(b):
    pg=new_page(b,NLE); select_intro(pg); assert pg.inner_text(".selected-name")=="Intro"
    x,y=to_screen(pg,900,600); pg.mouse.click(x,y); pg.wait_for_timeout(250)
    assert not pg.query_selector(".selected-name"),"empty click did not deselect"
    return "select and deselect OK"

@T("CV-002")
def _(b):
    pg=new_page(b,NLE); select_intro(pg)
    x,y=to_screen(pg,500,512); pg.keyboard.down("Shift"); pg.mouse.click(x,y); pg.keyboard.up("Shift"); pg.wait_for_timeout(250)
    assert pressed(pg)==["Intro","Photo"],"Shift+click: "+str(pressed(pg))
    pg.keyboard.down("Shift"); pg.mouse.click(x,y); pg.keyboard.up("Shift"); pg.wait_for_timeout(250)
    assert pressed(pg)==["Intro"],"Shift+click again should toggle off: "+str(pressed(pg))
    pg.keyboard.down("Control"); pg.mouse.click(x,y); pg.keyboard.up("Control"); pg.wait_for_timeout(250)
    assert pressed(pg)==["Intro","Photo"],"Ctrl+click: "+str(pressed(pg))
    return "Shift and Ctrl toggle work"

@T("CV-003")
def _(b):
    pg=new_page(b,NLE); ruler_click(pg,1.5)
    x0,y0=to_screen(pg,40,40); x1,y1=to_screen(pg,800,700); drag(pg,x0,y0,x1,y1)
    assert pressed(pg)==["Intro","Photo"],"marquee selected: "+str(pressed(pg))
    return "marquee selects touched layers"

@T("CV-004")
def _(b):
    pg=new_page(b,NLE); select_intro(pg); x,y=to_screen(pg,300,210); s=artboard(pg)[2]
    drag(pg,x,y,x+60,y+40); l=layer(pg,"layer-a"); p=pos(l)
    assert approx(p[0],100+60/s,3) and approx(p[1],100+40/s,3),f"moved to {p}, expected ~({100+60/s:.0f},{100+40/s:.0f})"
    pg.click("#undo"); pg.wait_for_timeout(250); p2=pos(layer(pg,"layer-a"))
    assert approx(p2[0],100,.01) and approx(p2[1],100,.01),f"one Undo did not restore: {p2}"
    return "drag moves; single undo restores"

@T("CV-007")
def _(b):
    pg=new_page(b,NLE); select_intro(pg); l0=layer(pg,"layer-a"); s=artboard(pg)[2]
    tl=to_screen(pg,100,100); drag(pg,tl[0],tl[1],tl[0]+40,tl[1]+30)
    l=layer(pg,"layer-a"); sx,sy=sc(l); p=pos(l); w=val(l["properties"]["width"]); h=val(l["properties"]["height"])
    bx,by=p[0]+w*sx,p[1]+h*sy
    fixed=approx(bx,500,1.5) and approx(by,325,1.5)
    prop=abs(sx/sy-1)<0.02
    assert fixed,f"opposite (bottom-right) corner moved to ({bx:.1f},{by:.1f}), expected (500,325)"
    assert prop,f"not proportional without Shift: scale=({sx:.3f},{sy:.3f})"
    pg.click("#undo"); pg.wait_for_timeout(250); l2=layer(pg,"layer-a")
    assert sc(l2)==[1,1] and pos(l2)==[100,100],"one undo did not restore"
    return f"scale=({sx:.3f},{sy:.3f})"

@T("CV-009")
def _(b):
    pg=new_page(b,NLE); select_intro(pg); s=artboard(pg)[2]
    cx,cy=to_screen(pg,300,212.5); top=to_screen(pg,300,100)[1]; found=None
    for off in [30,34,26,38,22,42,46]:
        pg2=pg
        drag(pg,cx,top-off,cx+150,cy,steps=15)
        r=rot(layer(pg,"layer-a"))
        if abs(r)>1: found=(off,r); break
    assert found,"rotation handle not found at 22-46px above top edge (no rotation happened)"
    l=layer(pg,"layer-a"); th=math.radians(rot(l)); sx,sy=sc(l); p=pos(l)
    hx,hy=200*sx,112.5*sy; ccx=p[0]+hx*math.cos(th)-hy*math.sin(th); ccy=p[1]+hx*math.sin(th)+hy*math.cos(th)
    assert approx(ccx,300,2) and approx(ccy,212.5,2),f"visual center moved to ({ccx:.1f},{ccy:.1f})"
    return f"rotation {rot(l):.1f} deg via handle {found[0]}px above top; centre fixed"

@T("CV-011")
def _(b):
    pg=new_page(b); pg.click('.scene-row[data-layer-id="example-headline"]'); pg.wait_for_timeout(300)
    l0=layer(pg,"example-headline"); w0=val(l0["properties"]["width"]); fs0=val(l0["properties"]["fontSize"])
    hx,hy=to_screen(pg,76+w0,165+115); drag(pg,hx,hy,hx-150,hy)
    l=layer(pg,"example-headline"); w=val(l["properties"]["width"]); fs=val(l["properties"]["fontSize"])
    assert w<w0-50,f"width did not shrink: {w0}->{w}"
    assert fs==fs0 and sc(l)==[1,1],f"font/scale changed: fs {fs0}->{fs}, scale {sc(l)}"
    return f"width {w0}->{w:.0f}, fontSize and scale unchanged"

@T("CV-016")
def _(b):
    pg=new_page(b,NLE)
    def z(): return int(re.search(r"(\d+)%",pg.locator("text=/\\d+%/").last.inner_text()).group(1))
    z0=z(); pg.click("[aria-label='Canvas zoom in']"); pg.wait_for_timeout(200); z1=z()
    pg.click("[aria-label='Canvas zoom out']"); pg.click("[aria-label='Canvas zoom out']"); pg.wait_for_timeout(200); z2=z()
    pg.click("text=Fit >> nth=0"); pg.wait_for_timeout(200); z3=z()
    assert z1>z0 and z2<z0 and z3==z0,f"zoom values fit={z0}, in={z1}, out={z2}, fit again={z3}"
    return f"{z0}% -> in {z1}% -> out {z2}% -> fit {z3}%"

@T("LYR-001")
def _(b):
    pg=new_page(b,NLE); ruler_click(pg,1.5)
    pg.click('.scene-row[data-layer-id="layer-c"]'); pg.wait_for_timeout(250)
    assert pg.inner_text(".selected-name")=="Photo"
    clip_pressed=pg.get_attribute('[data-clip-id="clip-c"]',"aria-pressed"); assert clip_pressed=="true","timeline clip not highlighted: "+str(clip_pressed)
    x,y=to_screen(pg,900,600); pg.mouse.click(x,y)
    x,y=to_screen(pg,300,210); pg.mouse.click(x,y); pg.wait_for_timeout(250)
    assert pressed(pg)==["Intro"],"list did not follow canvas selection: "+str(pressed(pg))
    return "list <-> canvas <-> timeline selection in sync"

@T("TL-004")
def _(b):
    pg=new_page(b,NLE); c0=clips(pg); body0=pg.inner_text("body")
    pg.click('[data-action="track-lock"][data-id="video-1"]'); pg.wait_for_timeout(200)
    cb=clipbox(pg,"clip-a"); drag(pg,cb["x"]+60,cb["y"]+10,cb["x"]+100,cb["y"]+10)
    cb=clipbox(pg,"clip-a"); rt=bbox(pg,'[data-clip-id="clip-a"] .timeline-trim.right'); drag(pg,rt["x"]+3,rt["y"]+8,rt["x"]-37,rt["y"]+8)
    cb=clipbox(pg,"clip-a"); lt=bbox(pg,'[data-clip-id="clip-a"] .timeline-trim.left'); drag(pg,lt["x"]+3,lt["y"]+8,lt["x"]+40,lt["y"]+8)
    pg.mouse.click(cb["x"]+60,cb["y"]+10); ruler_click(pg,1); pg.click("text=Split"); pg.keyboard.press("s"); pg.keyboard.press("Delete"); pg.wait_for_timeout(300)
    c1=clips(pg); ch={k:(c0[k],c1.get(k)) for k in c0 if c0[k]!=c1.get(k)}
    assert c1==c0,"locked track was edited: "+str(ch)+f" extra={set(c1)-set(c0)}"
    fb=[l for l in pg.inner_text("body").split("\n") if l not in body0.split("\n")]
    assert any(re.search("lock",l,re.I) for l in fb),"edits blocked but no visible feedback; new text: "+str(fb[:6])
    pg.click('[data-action="track-lock"][data-id="video-1"]'); cb=clipbox(pg,"clip-a"); drag(pg,cb["x"]+60,cb["y"]+10,cb["x"]+100,cb["y"]+10)
    assert clips(pg)["clip-a"]["start"]>0.3,"unlocked track did not allow drag"
    return "all edit paths blocked with feedback; unlock restores editing"

@T("TL-009")
def _(b):
    pg=new_page(b,NLE); ruler_click(pg,2); t=timecode(pg)
    assert re.search(r"\b2\.000s /",t),"click at 2s -> "+t.replace("\n"," | ")
    r=bbox(pg,".timeline-ruler"); drag(pg,r["x"]+80,r["y"]+8,r["x"]+240,r["y"]+8)
    t=timecode(pg); assert re.search(r"\b3\.000s /",t),"drag to 3s -> "+t.replace("\n"," | ")
    def px(sec):
        ruler_click(pg,sec); ax,ay,s=artboard(pg); box=pg.locator("canvas").bounding_box()
        im=Image.open(io.BytesIO(pg.screenshot(clip=box))).convert("RGB"); x,y=to_screen(pg,300,210); return im.getpixel((int(x-box["x"]),int(y-box["y"])))
    a=px(1.5); c=px(2.5)
    assert a!=c and abs(c[0]-BG[0])<8,f"canvas did not change with time: t1.5={a} t2.5={c}"
    return "ruler click/drag seeks; canvas content follows time"

@T("TL-012")
def _(b):
    pg=new_page(b,NLE); w0=clipbox(pg,"clip-a")["width"]; label=lambda: pg.locator("text=/px\\/s/").first.inner_text()
    l0=label(); pg.click("[aria-label='Timeline zoom in']"); pg.wait_for_timeout(200); w1=clipbox(pg,"clip-a")["width"]; l1=label()
    pg.click("[aria-label='Timeline zoom out']"); pg.click("[aria-label='Timeline zoom out']"); pg.wait_for_timeout(200); w2=clipbox(pg,"clip-a")["width"]; l2=label()
    assert w1>w0 and w2<w0,f"widths {w0},{w1},{w2} labels {l0},{l1},{l2}"
    return f"{l0} -> {l1} -> {l2}"

@T("TL-016")
def _(b):
    pg=new_page(b,NLE); cb=clipbox(pg,"clip-a"); drag(pg,cb["x"]+60,cb["y"]+10,cb["x"]+100,cb["y"]+10)
    c=clips(pg); assert approx(c["clip-a"]["start"],0.5,0.05),f"clip-a start {c['clip-a']['start']}"
    pg.click("#undo"); pg.wait_for_timeout(200); assert clips(pg)["clip-a"]["start"]==0,"undo did not restore within-track move"
    cb=clipbox(pg,"clip-b"); tr3=bbox(pg,'.timeline-track[data-track-id="video-3"]'); drag(pg,cb["x"]+60,cb["y"]+10,cb["x"]+60,tr3["y"]+10)
    c=clips(pg); assert c["clip-b"]["track"]=="video-3",f"clip-b on {c['clip-b']['track']} after cross-track drag"
    pg.click("#undo"); pg.wait_for_timeout(200); assert clips(pg)["clip-b"]["track"]=="video-1","undo did not restore cross-track move"
    return "within-track and cross-track moves, one undo each"

@T("TL-018")
def _(b):
    pg=new_page(b,NLE); lt=bbox(pg,'[data-clip-id="clip-b"] .timeline-trim.left'); drag(pg,lt["x"]+3,lt["y"]+8,lt["x"]+43,lt["y"]+8)
    k=clips(pg)["clip-b"]; assert approx(k["start"],3.5,.05) and approx(k["dur"],1.5,.05) and approx(k["sin"],1.5,.05),f"left trim gave {k}"
    lt=bbox(pg,'[data-clip-id="clip-b"] .timeline-trim.left'); drag(pg,lt["x"]+3,lt["y"]+8,lt["x"]-400,lt["y"]+8)
    k=clips(pg)["clip-b"]; ka=clips(pg)["clip-a"]
    assert k["sin"]>=-1e-6,f"went before source start: {k}"
    assert k["start"]>=ka["start"]+ka["dur"]-1e-6,f"overlaps neighbour clip-a: {k} vs {ka}"
    return f"trim ok; clamped at {k}"

@T("TL-019")
def _(b):
    pg=new_page(b,NLE); rt=bbox(pg,'[data-clip-id="clip-b"] .timeline-trim.right'); drag(pg,rt["x"]+3,rt["y"]+8,rt["x"]-37,rt["y"]+8)
    k=clips(pg)["clip-b"]; assert approx(k["dur"],1.5,.05),f"right trim gave {k}"
    rt=bbox(pg,'[data-clip-id="clip-b"] .timeline-trim.right'); drag(pg,rt["x"]+3,rt["y"]+8,rt["x"]+700,rt["y"]+8)
    k=clips(pg)["clip-b"]; assert k["sin"]+k["dur"]<=6+1e-6,f"extends past source end (6s): {k}"
    rt=bbox(pg,'[data-clip-id="clip-a"] .timeline-trim.right'); drag(pg,rt["x"]+3,rt["y"]+8,rt["x"]+200,rt["y"]+8)
    ka=clips(pg)["clip-a"]; kb=clips(pg)["clip-b"]; assert ka["start"]+ka["dur"]<=kb["start"]+1e-6,f"overlaps neighbour: {ka} vs {kb}"
    return "right trim, source end and neighbour clamps OK"

@T("TL-021")
def _(b):
    pg=new_page(b,NLE); cb=clipbox(pg,"clip-a"); pg.mouse.click(cb["x"]+60,cb["y"]+10); ruler_click(pg,1)
    pg.click("text=Split"); pg.wait_for_timeout(300); c=clips(pg)
    pieces=sorted([(v["start"],v["dur"]) for k,v in c.items() if v["track"]=="video-1" and v["start"]<2.5])
    assert len(pieces)==2 and approx(pieces[0][0]+pieces[0][1],pieces[1][0],.02) and approx(pieces[0][1],1,.05),f"Split button pieces {pieces}"
    pg.click("#undo"); pg.wait_for_timeout(200); assert len(clips(pg))==3,"undo of split failed"
    cb=clipbox(pg,"clip-a"); pg.mouse.click(cb["x"]+30,cb["y"]+10); ruler_click(pg,1); pg.keyboard.press("s"); pg.wait_for_timeout(300)
    assert len(clips(pg))==4,f"S key did not split ({len(clips(pg))} clips)"
    return "Split button and S key both cut the clip at playhead"

@T("TL-023")
def _(b):
    pg=new_page(b,NLE); cb=clipbox(pg,"clip-c"); pg.mouse.click(cb["x"]+60,cb["y"]+10); n=len(clips(pg))
    pg.click("text=Duplicate"); pg.wait_for_timeout(300); c=clips(pg); assert len(c)==n+1,f"Duplicate button: {n}->{len(c)}"
    new=[k for k in c if k not in ("clip-a","clip-b","clip-c")][0]; assert new!="clip-c"
    cb=clipbox(pg,"clip-c"); pg.mouse.click(cb["x"]+60,cb["y"]+10); pg.keyboard.press("Control+d"); pg.wait_for_timeout(300)
    assert len(clips(pg))==n+2,f"Ctrl+D did not duplicate ({len(clips(pg))} clips)"
    return "Duplicate button and Ctrl+D create copies with new IDs"

@T("TL-025")
def _(b):
    pg=new_page(b,NLE); cb=clipbox(pg,"clip-c"); pg.mouse.click(cb["x"]+60,cb["y"]+10); pg.keyboard.press("Delete"); pg.wait_for_timeout(300)
    assert "clip-c" not in clips(pg),"Delete key did not remove clip"
    pg.click("#undo"); pg.wait_for_timeout(200); assert "clip-c" in clips(pg),"one undo did not restore"
    return "Delete removes; one undo restores"

@T("TL-035")
def _(b):
    pg=new_page(b,NLE); ruler_click(pg,2); before=json.dumps(comp(pg).get("markers",[]))
    pg.click("text=+ Marker"); pg.wait_for_timeout(300); m=comp(pg).get("markers",[])
    assert len(m)==1 and approx(m[0]["time"] if "time" in m[0] else m[0].get("startTime",-1),2,.05),f"markers after click: {m}"
    return f"marker at {m[0]}"

@T("PB-001")
def _(b):
    pg=new_page(b,NLE); pg.click("[aria-label='Play or pause']"); pg.wait_for_timeout(1000)
    t=float(re.search(r"([\d.]+)s /",timecode(pg)).group(1)); assert 0.7<=t<=1.5,f"after ~1s, time is {t}"
    pg.click("[aria-label='Stop playback']"); pg.wait_for_timeout(200); t1=float(re.search(r"([\d.]+)s /",timecode(pg)).group(1)); pg.wait_for_timeout(500)
    t2=float(re.search(r"([\d.]+)s /",timecode(pg)).group(1)); assert t1==t2,f"time kept moving after Stop {t1}->{t2}"
    return f"~1s of playback -> {t:.3f}s; Stop holds at {t2:.3f}s"

@T("INS-002")
def _(b):
    pg=new_page(b,NLE); select_intro(pg); pg.fill("[aria-label='Position X']","250"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    assert approx(pos(layer(pg,"layer-a"))[0],250,.01),"inspector edit did not move layer"
    pg.click("#undo"); pg.wait_for_timeout(200); assert approx(pos(layer(pg,"layer-a"))[0],100,.01),"one undo did not restore"
    return "Position X edit moves layer; one undo restores"

@T("HIS-001")
def _(b):
    pg=new_page(b,NLE); select_intro(pg); x,y=to_screen(pg,300,210); drag(pg,x,y,x+60,y+40); p1=pos(layer(pg,"layer-a"))
    pg.click("#undo"); pg.wait_for_timeout(200); p2=pos(layer(pg,"layer-a")); assert p2==[100,100],f"undo -> {p2}"
    pg.click("#redo"); pg.wait_for_timeout(200); p3=pos(layer(pg,"layer-a")); assert p3==p1,f"redo -> {p3}, expected {p1}"
    return "drag = one undo step; redo reapplies"

@T("REL-001")
def _(b):
    pg=new_page(b); pg.wait_for_timeout(500)
    pg.click('.scene-row[data-layer-id="example-headline"]'); x,y=to_screen(pg,300,250); drag(pg,x,y,x+40,y+20)
    br=to_screen(pg,76+730,165+230); drag(pg,br[0],br[1],br[0]+20,br[1]+10)
    pg.click("[aria-label='Play or pause']"); pg.wait_for_timeout(1000); pg.click("[aria-label='Stop playback']")
    pg.click("#undo"); pg.click("#redo"); pg.wait_for_timeout(300)
    assert not pg.errs and not pg.bad,f"console errors: {pg.errs}; failed requests: {pg.bad}"
    return "no console errors"

if __name__=="__main__":
    only=set(sys.argv[1:])
    with sync_playwright() as p:
        br=p.chromium.launch(executable_path=CHROME,args=["--no-sandbox"])
        print("browser:",br.version)
        for t in sorted(TESTS,key=lambda t:t.id!="REL-001"):
            if only and t.id not in only: continue
            t(br)
            s,d=RES[t.id]; print(f"{s:5} {t.id:8} {d}",flush=True)
        br.close()
    json.dump(RES,open("/tmp/results.json","w"),indent=1)
