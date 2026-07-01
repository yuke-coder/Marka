import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const W=10,H=5,O=3,G=5,M=6,R=6,PAD='5px 9px';
type T={t:string;x:number;y:number;top:boolean;ax:number;dark:boolean}|null;

const m=document.createElement('span');
m.style.cssText='position:fixed;visibility:hidden;white-space:nowrap;font:500 12px/16px system-ui;padding:5px 9px';

export default function Tooltip(){
    const[s,setS]=useState<T>(null);
    const[v,setV]=useState(false);

    useEffect(()=>{
        let el:HTMLElement|null=null,raf=0,tid:ReturnType<typeof setTimeout>;
        const cancel=()=>{if(raf)cancelAnimationFrame(raf)};

        const show=(target:HTMLElement)=>{
            const txt=target.getAttribute('data-tooltip');
            if(!txt)return;
            clearTimeout(tid);
            const{left,top:t,width:rw,bottom:b}=target.getBoundingClientRect();
            const dark=document.documentElement.matches('.dark');
            const cx=left+rw/2;
            m.textContent=txt;
            document.body.appendChild(m);
            const tw=m.offsetWidth,th=m.offsetHeight;
            document.body.removeChild(m);

            const above=t-th-G-H+O>=M;
            const y=above?t-th-G-H+O:b+G+H-O;
            let x=cx-tw/2;
            x=Math.max(M,Math.min(x,innerWidth-M-tw));
            let ax=cx-x;
            ax=Math.max(W/2+R,Math.min(ax,tw-W/2-R));

            setS({t:txt,x,y,top:above,ax,dark});
            setV(true);
            el=target;
        };
        const hide=()=>{
            cancel();
            setV(false);
            tid=setTimeout(()=>{setS(null);el=null},100);
        };

        const evs:[string,EventListener|EventListenerObject,boolean?][]=[
            ['mouseover',(e:Event)=>{const t=(e.target as HTMLElement).closest('[data-tooltip]')as HTMLElement|null;if(t)show(t)}],
            ['mouseout',(e:Event)=>{const me=e as MouseEvent,t=(me.target as HTMLElement).closest('[data-tooltip]')as HTMLElement|null,r=(me.relatedTarget as HTMLElement|null)?.closest('[data-tooltip]')as HTMLElement|null;if(t&&t!==r)hide()}],
            ['click',hide],
            ['scroll',()=>{if(el){cancel();raf=requestAnimationFrame(()=>show(el!))}},true],
            ['resize',hide],
        ];
        evs.forEach(([ev,fn,cap])=>addEventListener(ev,fn,cap));
        return()=>{clearTimeout(tid);cancel();evs.forEach(([ev,fn,cap])=>removeEventListener(ev,fn,cap))};
    },[]);

    if(!s)return null;
    const d=s.dark,bg=d?'#2c2c2e':'#fff',bc=d?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.07)',sc=d?'rgba(0,0,0,0.4)':'rgba(0,0,0,0.08)',tc=d?'#f5f5f7':'#1d1d1f';

    return createPortal(
        <div className="fixed pointer-events-none" style={{left:s.x,top:s.y,zIndex:1e5,opacity:v?1:0,transition:'opacity .1s ease',filter:`drop-shadow(0 1px 4px ${sc})`}}>
            <div style={{padding:PAD,fontSize:12,fontWeight:500,lineHeight:'16px',color:tc,background:bg,border:`1px solid ${bc}`,borderRadius:R,whiteSpace:'nowrap',position:'relative'}}>{s.t}</div>
            <svg width={W}height={H}viewBox="0 0 30 10"preserveAspectRatio="none"style={{position:'absolute',left:s.ax-W/2,[s.top?'bottom':'top']:-H+O,transform:s.top?'none':'rotate(180deg)',display:'block'}}>
                <polygon points="-2.5,-2 32.5,-2 15,12.5"fill={bc}/>
                <polygon points="0,0 30,0 15,10"fill={bg}/>
            </svg>
        </div>,document.body
    );
}
