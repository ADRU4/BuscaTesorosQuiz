import * as SQLite from 'expo-sqlite';

const DB_NAME = 'treasures.db';

export const initDatabase = async () => {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS treasures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      encontrado INTEGER DEFAULT 0
    );
  `);
  
  return db;
};

export const saveTreasures = async (db, treasures) => {
  for (const treasure of treasures) {
    await db.runAsync(
      'INSERT INTO treasures (latitude, longitude, encontrado) VALUES (?, ?, ?)',
      [treasure.latitude, treasure.longitude, 0]
    );
  }
};

export const getTreasures = async (db) => {
  return await db.getAllAsync('SELECT * FROM treasures');
};

export const markAsFound = async (db, id) => {
  await db.runAsync('UPDATE treasures SET encontrado = 1 WHERE id = ?', [id]);
};

export const resetGame = async (db) => {
  await db.runAsync('DELETE FROM treasures');
};
