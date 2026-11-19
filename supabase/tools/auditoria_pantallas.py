import asyncio, importlib.util, sys, random, copy
spec=importlib.util.spec_from_file_location("b","/tmp/t51_base.py"); b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
DET=open('/tmp/aud.py').read().split('DET = r"""')[1].split('"""')[0]
MON=r"""(()=>{const out=new Set();const rc=(el)=>{const rs=[];const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=tw.nextNode()){if(!n.textContent.trim())continue;const g=document.createRange();g.selectNodeContents(n);let cl=-1e9,cr=1e9;for(let p=n.parentElement;p;p=p.parentElement){const o=getComputedStyle(p);if(o.overflowX!=='visible'){const q=p.getBoundingClientRect();cl=Math.max(cl,q.left);cr=Math.min(cr,q.right)}if(p===el)break}for(const r of g.getClientRects()){if(r.width>1&&r.height>1){const l=Math.max(r.left,cl),rr=Math.min(r.right,cr);if(rr-l>1)rs.push({left:l,right:rr,top:r.top,bottom:r.bottom})}}}if(!rs.length)return null;return {l:Math.min(...rs.map(r=>r.left)),r:Math.max(...rs.map(r=>r.right)),t:Math.min(...rs.map(r=>r.top)),b:Math.max(...rs.map(r=>r.bottom))}};
const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.closest('[hidden]')};
document.querySelectorAll('#app tr,#app .row,#app .mb-t,#app .inv-f,#app .item,#app .desemp-mini>div,#app .desemp-top,#app .met-vt,#app .al-fila,#app .al-t,#app .chk-al-i,.modal tr,.modal .row,.modal .fv-kpis,.modal .fv-cab,.modal .item-pie').forEach(p=>{ if(!vis(p))return; const ks=[...p.children].filter(c=>vis(c)&&getComputedStyle(c).position!=='absolute'); const cs=getComputedStyle(p); if(p.tagName!=='TR' && !(cs.display.includes('flex')&&!cs.flexDirection.startsWith('column'))) return;
 for(let i=0;i<ks.length-1;i++){const a=rc(ks[i]),c=rc(ks[i+1]); if(!a||!c)continue; if(a.r>c.l+2 && a.l<c.r-2 && a.b>c.t+2 && a.t<c.b-2) out.add('MONTADO: "'+ks[i].innerText.replace(/\s+/g,' ').slice(0,22)+'" sobre "'+ks[i+1].innerText.replace(/\s+/g,' ').slice(0,22)+'" ('+p.tagName+'.'+(p.className||'')+')');}
 if(p.tagName==='TR') ks.forEach(c=>{const a=rc(c),r=c.getBoundingClientRect(); if(a&&(a.r>r.right+2||a.l<r.left-2)) out.add('SE SALE: "'+c.innerText.replace(/\s+/g,' ').slice(0,24)+'" (td de '+(c.closest('table').className)+')');});
});return [...out].join(' ## ')||'sin montajes'})()"""
W="new Promise(r=>setTimeout(()=>r('%s'),%d))"
# ---------- datos de tamaño real: cifras de seis dígitos, 26 vendedoras, nombres largos ----------
random.seed(7)
VEND=[(b.UID,"Yaribeth Martinez")]+[("v%02d"%k,n) for k,n in enumerate(["Guadalupe Holt","Doris Galvez","Nilskya Vega","Diranis","Stephanie Raquel","Yerenis Lopez","Yasmín","María Fernanda Rodríguez de la Cruz"]+["Vendedora Número %d"%i for i in range(1,18)])]
CL=[]; AS=[]; OB=[]; VO=[]; FA=[]; INV=[]
cid=0
for vi,(vid,vn) in enumerate(VEND):
    for t in range(6 if vi>8 else 12):
        cid+=1; nom=random.choice(["Super 99","Xtra Maxi Feria","Rey","Jumbo","Virzi"])+" "+random.choice(["Plaza Las Américas","Brisas del Golf","Colón Puerto Escondido","Penonomé","Vía Porras","24 de Diciembre"])+" %d"%cid
        CL.append({"id":cid,"nombre":nom,"cadena":nom.split()[0],"zona":"Pty 04","lat":8.99,"lng":-79.51,"radio_m":100,"codigo":"C%d"%cid,"activo":True,"modalidad":"pedido_tienda"})
        AS.append({"vendedor_id":vid,"cliente_id":cid,"dias_semana":[1+cid%6,1+(cid+3)%6],"orden":t,"clientes":{"nombre":nom,"cadena":nom.split()[0],"zona":"Pty 04"},"perfiles":{"nombre":vn}})
        for pid,pr,cj in [(10,11.45,22),(11,11.59,20)]:
            ok=cj*random.choice([2,3,4,6]); vk=round(ok*random.uniform(0,1.1),1)
            o={"mes":"2026-11-01","cliente_id":cid,"producto_id":pid,"objetivo_kg":ok,"objetivo_usd":round(ok*pr,2),"venta_kg":vk,"venta_usd":round(vk*pr,2),"corte":"2026-11-18"}
            OB.append(o); VO.append({**o,"tienda":nom,"vendedora":vn,"zona":"Pty 04"})
            for m in ["2026-06-01","2026-07-01","2026-08-01","2026-09-01","2026-10-01","2026-11-01"]:
                v=round(ok*pr*random.uniform(.6,1.2),2); me=round(v*random.uniform(0,.09),2)
                FA.append([m,cid,pid if m<"2026-10" else pid,round(v/pr,1),v,me if m<"2026-10" else 0])
                if m>="2026-10": FA.append([m,cid,0,0,0,me/2])
        if t<9:
            for pid,nm,kg in [(10,"Queso Mozzarella",random.choice([0,5.4,27.2,60])),(11,"Queso Muenster",random.choice([0,9,36]))]:
                INV.append({"visita_id":1000+cid,"vendedor_id":vid,"vendedor":vn,"cliente_id":cid,"tienda":nom,"fecha":"2026-11-%02d"%random.choice([12,16,17,18]),"checkin_at":"2026-11-18T14:00:00Z","producto_id":pid,"producto":nm,"unidades":kg/2.72,"kg":kg,"agotado":kg==0,"bajo":0<kg<9,"con_pedido":False})
b.FX.update({"clientes":CL,"asignacion_tiendas":AS,"objetivos":OB,"v_objetivos":VO,"v_inventario_visita":INV,"pedido_items":[],
 "perfiles":[{"id":i,"nombre":n,"rol":"vendedor","activo":True} for i,n in VEND],"rpc/facturacion_desde":{"corte":"2026-11-18","filas":FA}})
vz=[]
for vi,(vid,vn) in enumerate(VEND[:12]):
    for k,a in enumerate([x for x in AS if x["vendedor_id"]==vid][:5]):
        for d in ["2026-11-16","2026-11-17","2026-11-18","2026-11-19"]:
            vz.append({"id":len(vz)+1,"vendedor_id":vid,"cliente_id":a["cliente_id"],"fecha":d,"vendedor":vn,"tienda":a["clientes"]["nombre"],"checkin_at":d+"T%02d:10:00Z"%(13+k*2),"checkout_at":d+"T%02d:55:00Z"%(14+k*2),"minutos_en_tienda":105,"checkin_dentro":k!=2,"checkout_dentro":True,"num_fotos":3,"con_inventario":True,"estado":"cerrada"})
b.FX["v_visitas"]=vz
b.FX["v_pedidos"]=[{"id":i,"visita_id":v["id"],"tienda":v["tienda"],"vendedor":v["vendedor"],"vendedor_id":v["vendedor_id"],"cliente_id":v["cliente_id"],"estado":"propuesto","creado_at":v["checkin_at"],"total_kg":1240.5,"total_cajas":56,"documento":None,"numero_orden":None} for i,v in enumerate(vz[:40])]
V=lambda i,t,e,s,m,d=True:{"id":i,"tienda":t,"entrada":e,"salida":s,"min":m,"agendada":True,"dentro":d}
b.FX["rpc/cierre_dia"]={"vendedor":"María Fernanda Rodríguez de la Cruz","vendedor_id":b.UID,"fecha":"2026-11-18","hechas":4,"agendadas":5,"pendientes":1,"en_curso":0,"abiertas":0,"justificadas":0,"fuera_agenda":1,"pedidos":3,"kg":1240.5,"agotados":2,"por_vencer":1,"fuera_radio":1,"cortas":1,"min_prom":135,"primera":"2026-11-18T14:00:00Z","ultima":"2026-11-18T23:00:00Z",
 "tiendas":[{"nombre":c["nombre"],"estado":e,"cliente_id":c["id"],"motivo":"tienda_cerrada" if e=="justificada" else None} for c,e in zip(CL[:5],["hecha","hecha","hecha","hecha","pendiente"])],
 "visitas":[V(1,CL[0]["nombre"],"2026-11-18T14:00:00Z","2026-11-18T16:09:00Z",129),V(2,CL[1]["nombre"],"2026-11-18T17:26:00Z","2026-11-18T20:23:00Z",177),V(3,CL[2]["nombre"],"2026-11-18T20:32:00Z","2026-11-18T22:17:00Z",105),V(4,CL[3]["nombre"],"2026-11-18T22:50:00Z","2026-11-18T23:00:00Z",10,False)],"oportunidades":[]}
def chk(n): return [("eval",W%("--- "+n,700)),("eval",DET),("eval",MON)]
RUT={"admin":["hoy","equipo","programacion","pedidos","planogramas","picking","mis-pedidos","config","mensajes","yo","soporte"],"supervisor":["hoy","equipo","programacion","pedidos","mensajes","yo"],"operaciones":["picking","pedidos","mensajes","yo"],"administracion":["picking","pedidos","mensajes","yo"],"vendedor":["hoy","mis-pedidos","mensajes","yo","soporte"]}
async def main():
    rol=sys.argv[1]; w=int(sys.argv[2]); st=[("go","#resumen"),("eval","localStorage.setItem('clarus.msg.pospuesto',String(Date.now()+9e6));localStorage.setItem('clarus.bienvenida','true');localStorage.removeItem('clarus.res.tab');localStorage.setItem('clarus.res.v',JSON.stringify(''));localStorage.setItem('clarus.res.p',JSON.stringify('mes'))")]
    if rol!="vendedor":
        st+=[("go","#resumen"),("eval",W%("carga",2500))]
        for sel in ["","v"]:
            if sel: st+=[("eval","(()=>{const s=document.querySelector('#rv');if(!s)return 'sin selector';s.value=s.options[9].value;s.dispatchEvent(new Event('change'));return 'elige '+s.options[9].text})()"),("eval",W%("carga",2500))]
            for k in ["equipo","vendedora","inventario","merma","ventas"]:
                st+=[("eval","(document.querySelector('[data-rt-b=%s]')?.click(),'')"%k)]+chk("resumen/%s%s"%(k," con vendedora" if sel else ""))
        st+=[("eval","(document.querySelector('[data-rt-b=equipo]')?.click(),document.querySelector('[data-eqd]:nth-of-type(2)')?.click(),'')")]+chk("equipo ayer")
        st+=[("eval","(document.querySelector('#eq-lista [data-cierre]')?.click(),'')")]+chk("cierre del día")+[("shot","cierre"),("eval","(document.querySelector('.cd-vis tr[data-fv]')?.click(),'')")]+chk("ficha de visita")+[("eval","(document.querySelectorAll('.modal').forEach(m=>m.remove()),'')")]
        if rol in("admin","operaciones","supervisor"):
            st+=[("go","#objetivos")]+chk("metas todas")+[("eval","(document.querySelector('.met-v[data-g]')?.click(),'')"),("eval",W%("",1500))]+chk("metas vendedora")
    else:
        st+=[("go","#hoy")]
    for r in RUT[rol]:
        st+=[("go","#"+r)]+chk(r)
        if r=="config":
            for t in ["empresa","tiendas","productos","catalogos","usuarios","permisos"]:
                st+=[("eval","(document.querySelector('[data-tab=\"%s\"],[data-t=\"%s\"]')?.click(),'')"%(t,t))]+chk("config/"+t)
    if rol=="vendedor":
        st+=[("eval","(()=>{const c=JSON.parse(localStorage.getItem('clarus.cat'));const v={lid:'L1',cliente_id:1,tienda:c.clientes[0].nombre,cadena:'Super 99',modalidad:'pedido_tienda',at:new Date().toISOString(),lat:8.99,lng:-79.51,gestiones:{},fotos:[],inv:{},promos:[],pedido:null,guardado:{},merma:MERMA.tienda(c,1),alertas:[{tipo:'inventario',nivel:'alta',titulo:'Producto agotado: haz el pedido',detalle:'En la visita anterior quedó agotado.',productos:[{producto:'Mozzarella',agotado:true},{producto:'Muenster',kg:1.2,pct:26,bajo:true}]}]};Visita.set(v);location.hash='#visita';return ''})()")]+chk("check-in alertas y merma")+[("eval","(Visita.set(null),'')")]
    await b.run(rol,w,780 if w<900 else 900,st,"X_%s_%d"%(rol,w))
asyncio.run(main())
