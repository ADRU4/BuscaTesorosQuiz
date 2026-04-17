import * as SQLite from 'expo-sqlite';
import { generateRandomCoordinates, getDistance } from '../utils/geoUtils';

const DB_NAME = 'treasures.db';
const TOTAL_TREASURES = 3;
const SEED_RADIUS = 200;

let _db = null;

export const initDatabase = async () => {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);

  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS treasures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      found INTEGER NOT NULL DEFAULT 0,
      created_at TEXT
    );
  `);

  return _db;
};

export const seedTreasuresIfEmpty = async (currentLat, currentLng) => {
  const db = await initDatabase();
  const row = await db.getFirstAsync('SELECT COUNT(*) as count FROM treasures');
  if (row.count > 0) return;

  const coords = generateRandomCoordinates(currentLat, currentLng, SEED_RADIUS, TOTAL_TREASURES);
  const now = new Date().toISOString();

  for (const c of coords) {
    await db.runAsync(
      'INSERT INTO treasures (latitude, longitude, found, created_at) VALUES (?, ?, 0, ?)',
      [c.latitude, c.longitude, now]
    );
  }
};

export const getNearestActiveTreasure = async (currentLat, currentLng) => {
  const db = await initDatabase();
  const pending = await db.getAllAsync('SELECT * FROM treasures WHERE found = 0');
  if (pending.length === 0) return null;

  let nearest = null;
  let minDist = Infinity;

  for (const t of pending) {
    const dist = getDistance(currentLat, currentLng, t.latitude, t.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = { ...t, distance: dist };
    }
  }

  return nearest;
};

export const markTreasureAsFound = async (id) => {
  const db = await initDatabase();
  await db.runAsync('UPDATE treasures SET found = 1 WHERE id = ?', [id]);
};

export const getFoundCount = async () => {
  const db = await initDatabase();
  const row = await db.getFirstAsync('SELECT COUNT(*) as count FROM treasures WHERE found = 1');
  return row.count;
};

export const getTreasures = async () => {
  const db = await initDatabase();
  return await db.getAllAsync('SELECT * FROM treasures');
};

export const updateTreasureLocation = async (id, latitude, longitude) => {
  const db = await initDatabase();
  await db.runAsync(
    'UPDATE treasures SET latitude = ?, longitude = ? WHERE id = ?',
    [latitude, longitude, id]
  );
};

export const resetGame = async () => {
  const db = await initDatabase();
  await db.runAsync('DELETE FROM treasures');
};
