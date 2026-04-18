const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Initialize SQLite Database
const dbPath = path.resolve(__dirname, 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error opening database', err.message);
    else console.log('Connected to SQLite database.');
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT,
        name TEXT,
        dept TEXT,
        date TEXT,
        login_time TEXT,
        logout_time TEXT,
        hours TEXT,
        extra_hours TEXT,
        tasks TEXT,
        status TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Routes
app.post('/api/attendance', (req, res) => {
    const { id, name, dept, date, loginT, logoutT, hours, extraHours, tasks, status } = req.body;
    
    // Check if a record already exists for this employee and date to update instead of insert
    const checkSql = `SELECT id FROM attendance WHERE employee_id = ? AND date = ?`;
    db.get(checkSql, [id, date], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            // Update existing record
            const updateSql = `UPDATE attendance SET 
                login_time = ?, logout_time = ?, hours = ?, extra_hours = ?, tasks = ?, status = ?
                WHERE id = ?`;
            db.run(updateSql, [loginT, logoutT, hours, extraHours, tasks, status, row.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Record updated', id: row.id });
            });
        } else {
            // Insert new record
            const insertSql = `INSERT INTO attendance (employee_id, name, dept, date, login_time, logout_time, hours, extra_hours, tasks, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            db.run(insertSql, [id, name, dept, date, loginT, logoutT, hours, extraHours, tasks, status], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Record saved', id: this.lastID });
            });
        }
    });
});

app.get('/api/attendance', (req, res) => {
    db.all(`SELECT * FROM attendance ORDER BY date DESC, timestamp DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Normalize for frontend
        const normalized = rows.map(r => ({
            id: r.employee_id,
            name: r.name,
            dept: r.dept,
            date: r.date,
            logint: r.login_time,
            logoutt: r.logout_time,
            hours: r.hours,
            extrahours: r.extra_hours,
            tasks: r.tasks,
            status: r.status
        }));
        res.json(normalized);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
