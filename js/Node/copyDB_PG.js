"use strict";

var sqlite3 = require("sqlite3").verbose();
var request = require("request");
var dbVars = require("./dbVars");

const db = new sqlite3.Database(dbVars.DATABASE_PATH, (err) => {
	if (err) {
		console.error('Error opening database:', err.message);
	} else {
		console.log('Connected to SQLite database for setup');
	}
});

// Helper function to promisify SQLite operations
function dbRun(sql, params = []) {
	return new Promise((resolve, reject) => {
		db.run(sql, params, function(err) {
			if (err) {
				reject(err);
			} else {
				resolve({ changes: this.changes, lastID: this.lastID });
			}
		});
	});
}

var numTables = (dbVars.ADD_DEBUG_TABLES ? 4 : 2);
var numDone = 0;

request("http://nflscorigami.com/copydb", function(error, response, data)
{
	data = JSON.parse(data);

	// SQLite requires separate statements
	dbRun("DROP TABLE IF EXISTS scores")
		.then(() => {
			return dbRun(`CREATE TABLE IF NOT EXISTS scores (
				pts_win INTEGER, 
				pts_lose INTEGER, 
				count INTEGER, 
				first_date TEXT, 
				first_team_win TEXT, 
				first_team_lose TEXT, 
				first_team_home TEXT, 
				first_team_away TEXT, 
				first_link TEXT, 
				last_date TEXT, 
				last_team_win TEXT, 
				last_team_lose TEXT, 
				last_team_home TEXT, 
				last_team_away TEXT, 
				last_link TEXT
			)`);
		})
		.then(res => 
		{
			setupScoresTable(data, false);
		})
		.catch(err =>
		{
			console.log("error creating scores table");
			console.log(err);
		});

	// SQLite requires separate statements  
	dbRun("DROP TABLE IF EXISTS metadata")
		.then(() => {
			return dbRun(`CREATE TABLE IF NOT EXISTS metadata (
				description TEXT, 
				data_int INTEGER, 
				data_text TEXT, 
				data_date TEXT
			)`);
		})
		.then(res => 
		{
			setupMetadataTable(data, false);
		})
		.catch(err =>
		{
			console.log("error creating metadata table");
			console.log(err);
		});

	if(dbVars.ADD_DEBUG_TABLES)
	{
		dbRun("DROP TABLE IF EXISTS scores_DEBUG")
			.then(() => {
				return dbRun(`CREATE TABLE IF NOT EXISTS scores_DEBUG (
					pts_win INTEGER, 
					pts_lose INTEGER, 
					count INTEGER, 
					first_date TEXT, 
					first_team_win TEXT, 
					first_team_lose TEXT, 
					first_team_home TEXT, 
					first_team_away TEXT, 
					first_link TEXT, 
					last_date TEXT, 
					last_team_win TEXT, 
					last_team_lose TEXT, 
					last_team_home TEXT, 
					last_team_away TEXT, 
					last_link TEXT
				)`);
			})
			.then(res => 
			{
				setupScoresTable(data, true);
			})
			.catch(err =>
			{
				console.log("error creating scores DEBUG table");
				console.log(err);
				checkDone();
			});

		dbRun("DROP TABLE IF EXISTS metadata_DEBUG")
			.then(() => {
				return dbRun(`CREATE TABLE IF NOT EXISTS metadata_DEBUG (
					description TEXT, 
					data_int INTEGER, 
					data_text TEXT, 
					data_date TEXT
				)`);
			})
			.then(res => 
			{
				setupMetadataTable(data, true);
			})
			.catch(err =>
			{
				console.log("error creating metadata DEBUG table");
				console.log(err);
				checkDone();
			});
	}
});

//client.end();

function setupScoresTable(data, isDebugTable)
{
	// Use individual prepared statements for better performance and SQL injection protection
	var tableName = "scores" + (isDebugTable ? "_DEBUG" : "");
	var insertQueries = [];
	
	for(var i = 0; i < data.scores.length; i++)
	{
		var score = data.scores[i];
		var first_date = score.first_date.substr(0, 10);
		var last_date = score.last_date.substr(0, 10);

		var insertSQL = `INSERT INTO ${tableName} (pts_win, pts_lose, count, first_date, first_team_win, first_team_lose, first_team_home, first_team_away, first_link, last_date, last_team_win, last_team_lose, last_team_home, last_team_away, last_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
		
		insertQueries.push(dbRun(insertSQL, [
			score.pts_win, 
			score.pts_lose, 
			score.count, 
			first_date, 
			score.first_team_win, 
			score.first_team_lose, 
			score.first_team_home, 
			score.first_team_away, 
			score.first_link, 
			last_date, 
			score.last_team_win, 
			score.last_team_lose, 
			score.last_team_home, 
			score.last_team_away, 
			score.last_link
		]));
	}

	Promise.all(insertQueries)
		.then(res => {
			console.log("added scores table" + (isDebugTable ? " (DEBUG)" : ""));
			checkDone();
		})
		.catch(err => {
			console.log("error inserting into scores table");
			console.log(err);
			checkDone();
		});
}

function setupMetadataTable(data, isDebugTable)
{
	var tableName = "metadata" + (isDebugTable ? "_DEBUG" : "");
	var insertQueries = [];
	
	for(var i = 0; i < data.metadata.length; i++)
	{
		var metadatum = data.metadata[i];
		var data_date = (metadatum.data_date === null ? null : metadatum.data_date.substr(0, 10));

		var insertSQL = `INSERT INTO ${tableName} (description, data_int, data_text, data_date) VALUES (?, ?, ?, ?)`;
		
		insertQueries.push(dbRun(insertSQL, [
			metadatum.description,
			metadatum.data_int,
			metadatum.data_text,
			data_date
		]));
	}

	// Add hit counter
	insertQueries.push(dbRun(`INSERT INTO ${tableName} (description, data_int) VALUES ('hit_counter', 0)`));

	Promise.all(insertQueries)
		.then(res => {
			console.log("added metadata table" + (isDebugTable ? " (DEBUG)" : ""));
			checkDone();
		})
		.catch(err => {
			console.log("error inserting into metadata table");
			console.log(err);
			checkDone();
		});
}

function checkDone()
{
	numDone++;
	if(numDone >= numTables)
	{
		db.close((err) => {
			if (err) {
				console.error(err.message);
			} else {
				console.log('Database setup complete. Closed SQLite connection.');
			}
		});
	}
}