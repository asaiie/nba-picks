"""Extract the official NBA schedule PDF to idempotent D1 SQL. Requires pypdf."""
import sys,re,datetime,collections
from zoneinfo import ZoneInfo
from pathlib import Path
from pypdf import PdfReader
names=['Atlanta','Boston','Brooklyn','Charlotte','Chicago','Cleveland','Detroit','Indiana','Miami','Milwaukee','New York','Orlando','Philadelphia','Toronto','Washington','Dallas','Denver','Golden State','Houston','LA Clippers','LA Lakers','Memphis','Minnesota','New Orleans','Oklahoma City','Phoenix','Portland','Sacramento','San Antonio','Utah']
codes='ATL BOS BKN CHA CHI CLE DET IND MIA MIL NYK ORL PHI TOR WAS DAL DEN GSW HOU LAC LAL MEM MIN NOP OKC PHX POR SAC SAS UTA'.split()
lookup=dict(zip(names,codes)); games=[];unparsed=[]
for page in PdfReader(sys.argv[1]).pages:
 for line in page.extract_text(extraction_mode='layout').splitlines():
  if not re.match(r'^\s*\d+\s+\w+\.\s+\d+/\d+/\d+',line):continue
  match=re.match(r'^\s*(\d+)\s+\w+\.\s+(\d+/\d+/\d+)\s+(.+?)\s+(?:at|vs)\s+(.+?)\s+(\d+:\d+\s+[AP]M)\s+(\d+:\d+\s+[AP]M)',line)
  if not match:unparsed.append(line.strip());continue
  number,date,away,home,local,et=match.groups();away=lookup[' '.join(away.split())];home=lookup[' '.join(home.split())]
  dt=datetime.datetime.strptime(date+' '+et,'%m/%d/%y %I:%M %p').replace(tzinfo=ZoneInfo('America/New_York'))
  assert datetime.date(2026,10,1)<=dt.date()<=datetime.date(2027,4,30)
  games.append((f'00226{int(number):05}',home,away,int(dt.timestamp()*1000),dt.strftime('%Y-%m-%d')))
assert len(games)>1000, f'Only {len(games)} games parsed; refusing partial import'
assert len({g[0] for g in games})==len(games),'Duplicate IDs'
assert len({(g[1],g[2],g[4]) for g in games})==len(games),'Duplicate matchups'
counts=collections.Counter(t for g in games for t in g[1:3]);assert max(counts.values())<=82,counts
output=Path(sys.argv[2]);output.write_text('-- Source: https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf\n-- Published August 13, 2026. Times converted with America/New_York.\n-- INSERT OR IGNORE preserves admin corrections and results on reruns.\n'+''.join(f"INSERT OR IGNORE INTO games(id,home,away,tipoff,day) VALUES('{id}','{home}','{away}',{tipoff},'{day}');\n" for id,home,away,tipoff,day in games))
print(f'Imported {len(games)} games. Team counts: {dict(sorted(counts.items()))}')
print(f'{len(unparsed)} rows without confirmed times or matchups:')
for line in unparsed:print(line)
