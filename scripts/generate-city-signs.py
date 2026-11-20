"""Regenerate the bundled original sign art with Pillow.

Fonts are Noto Sans CJK JP Bold (NotoSansCJK-Bold.ttc, face 0) and DejaVu
Sans Mono Bold (DejaVuSansMono-Bold.ttf). The defaults use Debian's paths.
"""

from argparse import ArgumentParser
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

parser = ArgumentParser(description=__doc__)
parser.add_argument("--japanese-font", default="/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")
parser.add_argument("--mono-font", default="/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")
parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "src/city/tokyo-signs.jpg")
args = parser.parse_args()

W,H=2048,1024
atlas=Image.new('RGB',(W,H),'#070b13')

def f(size, latin=False):
    return ImageFont.truetype(args.mono_font if latin else args.japanese_font,size,index=0)

def size_for(s,width,start,latin=False):
    while f(start,latin).getlength(s)>width and start>5: start-=1
    return f(start,latin)

def sign(i,mode,title,sub,neon,bg):
    if mode=='v': w,h=84,244
    elif mode=='h': w,h=244,82
    else: w,h=244,244
    panel=Image.new('RGB',(w,h),bg)
    d=ImageDraw.Draw(panel)
    for y in range(3,h-2,4):
        d.line((2,y,w-3,y),fill=tuple(min(255,c+7) for c in panel.getpixel((0,0))))
    d.rounded_rectangle((1,1,w-2,h-2),radius=4,outline=neon,width=2)
    d.rectangle((5,5,w-6,h-6),outline=tuple(max(0,int(c*.40)) for c in neon),width=1)
    for x,y in [(5,5),(w-7,5),(5,h-7),(w-7,h-7)]: d.rectangle((x,y,x+2,y+2),fill=neon)
    mask=Image.new('L',(w,h),0)
    md=ImageDraw.Draw(mask)
    icons=ImageDraw.Draw(panel)
    if mode=='v':
        span=(h-44)/len(title)
        for j,letter in enumerate(title):
            md.text((w*.5,17+span*(j+.5)),letter,font=f(min(54,int(span*.94))),anchor='mm',fill=255,stroke_width=0)
        d.text((w*.5,h-17),sub,font=size_for(sub,w-16,10,True),fill=neon,anchor='mm')
        d.line((13,14,13,h-27),fill=neon,width=1)
        d.line((w-14,14,w-14,h-27),fill=neon,width=1)
    elif mode=='h':
        md.text((w*.5,34),title,font=size_for(title,w-27,49),anchor='mm',fill=255)
        d.text((w*.5,65),sub,font=size_for(sub,w-18,12,True),fill=neon,anchor='mm')
    else:
        if i==7:
            for n in range(7):
                x=40+n*27
                icons.line((x+35,30,x-20,161),fill=(40,122,162),width=1)
                icons.line((x+26,56,x+10,95),fill=(40,246,238),width=2)
            icons.arc((30,36,218,204),180,325,fill=neon,width=3)
            icons.ellipse((24,29,218,223),outline=(20,104,143),width=1)
        else:
            for r in (39,66,89): icons.ellipse((122-r,121-r,122+r,121+r),outline=neon,width=1)
            for n in range(12):
                a=n*math.tau/12
                icons.line((122+82*math.cos(a),121+82*math.sin(a),122+93*math.cos(a),121+93*math.sin(a)),fill=neon,width=2)
            icons.line((21,121,223,121),fill=neon,width=1)
            icons.line((122,21,122,222),fill=neon,width=1)
        md.text((w*.5,110),title,font=size_for(title,w-28,111),anchor='mm',fill=255)
        d.text((w*.5,h-34),sub,font=size_for(sub,w-28,17,True),fill=neon,anchor='mm')
        d.line((24,h-50,w-24,h-50),fill=neon,width=1)
    panel.paste(neon,(0,0,w,h),mask.filter(ImageFilter.GaussianBlur(6)).point(lambda x:int(x*.50)))
    ink=tuple(int(c*.26+255*.74) for c in neon)
    panel.paste(ink,(0,0,w,h),mask)
    left=(i%8)*256+(256-w)//2
    top=(i//8)*256+(256-h)//2
    atlas.paste(panel,(left,top))

P=(255,54,150); C=(66,241,252); T=(255,175,78); R=(255,61,80); L=(174,249,101); V=(144,137,255); B=(92,168,255)
for i,mode,title,sub,neon,bg in [
    (0,'v','歌舞伎町','KABUKI',P,'#250c24'),
    (1,'h','東京電気街','TOKYO ELECTRIC DISTRICT',C,'#092030'),
    (2,'v','カラオケ','KARAOKE',C,'#0b222d'),
    (3,'v','ラーメン','RAMEN',R,'#310a17'),
    (4,'h','深夜ラーメン','OPEN UNTIL MORNING',P,'#360b23'),
    (5,'h','雨ノ市場','NIGHT MARKET',L,'#151f1a'),
    (6,'v','居酒屋','SAKE',T,'#371a12'),
    (7,'s','雨','RAIN CHANNEL 07',C,'#09263a'),
    (8,'h','東京中央駅','TOKYO CENTRAL STATION',C,'#092b37'),
    (9,'h','珈琲スタンド','COFFEE STAND',T,'#251c15'),
    (10,'v','新宿','SHINJUKU',B,'#0c1c3b'),
    (11,'s','未来','MIRAI SYSTEMS',P,'#260b2f'),
    (12,'h','自動販売','24H VENDING',C,'#1a2636'),
    (13,'h','寿司','SUSHI BAR',R,'#380f1e'),
    (14,'v','音楽','MUSIC',V,'#210a3c'),
    (15,'h','ホテル','CITY HOTEL',B,'#15203c'),
    (16,'h','営業中','OPEN 24 HOURS',T,'#302016'),
    (17,'v','東京','TOKYO',P,'#310d2a'),
    (18,'h','深夜営業','MIDNIGHT ARCADE',V,'#1a102d'),
    (19,'h','入口','STATION ENTRANCE',C,'#0a2426'),
]: sign(i,mode,title,sub,neon,bg)
args.output.parent.mkdir(parents=True, exist_ok=True)
atlas.save(args.output, quality=92, optimize=True, subsampling=0)
