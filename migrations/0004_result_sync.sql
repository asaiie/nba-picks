ALTER TABLE games ADD COLUMN result_source TEXT;
ALTER TABLE games ADD COLUMN manual_result INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN home_score INTEGER;
ALTER TABLE games ADD COLUMN away_score INTEGER;
ALTER TABLE games ADD COLUMN result_updated INTEGER;
ALTER TABLE games ADD COLUMN provider_id TEXT;
UPDATE games SET manual_result=1,result_source='manual' WHERE status='final';
CREATE UNIQUE INDEX games_provider_id ON games(provider_id);
CREATE TABLE sync_lock(id INTEGER PRIMARY KEY CHECK(id=1), token TEXT, expires INTEGER NOT NULL);
INSERT INTO sync_lock VALUES(1,NULL,0);
CREATE TABLE sync_runs(id TEXT PRIMARY KEY,started INTEGER NOT NULL,finished INTEGER,success INTEGER,report TEXT);
CREATE TABLE sync_days(day TEXT PRIMARY KEY,checked INTEGER NOT NULL);
CREATE TABLE result_history(id INTEGER PRIMARY KEY,game_id TEXT,changed INTEGER,old_winner TEXT,new_winner TEXT,home_score INTEGER,away_score INTEGER,source TEXT);
CREATE TRIGGER audit_result AFTER UPDATE OF winner,home_score,away_score ON games
WHEN OLD.winner IS NOT NEW.winner OR OLD.home_score IS NOT NEW.home_score OR OLD.away_score IS NOT NEW.away_score
BEGIN
 INSERT INTO result_history(game_id,changed,old_winner,new_winner,home_score,away_score,source) VALUES(NEW.id,unixepoch()*1000,OLD.winner,NEW.winner,NEW.home_score,NEW.away_score,NEW.result_source);
END;
