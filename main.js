#!/usr/bin/env node
"use strict";

const co      = require('co');
const es      = require('event-stream');
const duniter = require('duniter');
const http    = require('http');
const path    = require('path');
const express = require('express');
const geoip   = require('geoip-lite');


const HOME_DUNITER_DATA_FOLDER = 'duniter_map';

// Use netobs data folder
if (!process.argv.includes('--mdb')) {
	process.argv.push('--mdb');
	process.argv.push(HOME_DUNITER_DATA_FOLDER);
}

// Default action = start
if (process.argv.length === 4) process.argv.push('start');

// Disable Duniter logs
duniter.statics.logger.mute();

duniter.statics.cli((duniterServer) => co(function*() {

	try {

	const app = express();
	const HOST = 'localhost';
	const PORT = 10500;

	var peerTable = {};

	function inPeers(pubkey) {
		if (pubkey in peerTable)
			return true;
		return false;
	}
	function addPeer(pubkey, geo, addresses, port, status) {
		peerTable[pubkey] = {
			 "type": "Feature",
			"geometry": {
				"type": "Point",
				"coordinates": [geo.ll[1], geo.ll[0]]
			},
			"properties": {
				"name": "_Peer " + pubkey,
				"pubkey": pubkey,
				"addresses": addresses,
				"port": port,
				"status": status,
				"description": "Peer " + pubkey + " (" + status + ")"
			}
		};
	}

	const staticContentPath = path.join(__dirname, './static');
	app.use(express.static(staticContentPath));

	/**
	 * Sur appel de l'URL /abc
	 */
	app.get('/peers.geojson', (req, res) => co(function *() {
		try {
			var json = {
				"type": "FeatureCollection",
				"features": []
			};
			var p;
			for (p in peerTable) {
				json.features.push(peerTable[p]);
			}
			res.type('application/geo+json');
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.status(200).send(json);
		} catch (e) {
			// En cas d'exception, afficher le message
			res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
		}
	}));


	console.log("Resolving initial known peers...");
	try {
		const peers = yield duniterServer.dal.peerDAL.listAll();
		//console.log(peers);
		var data;
		for (data of peers) {
			//var data = peers[pe];
			var status = data.status;
			var ipv4 = null;
			var ipv6 = null;
			var addresses = [];
			var port = "0";
			var ep;
			//TODO: try next one if first resolve failed
			//TODO: handle IPv6 as well
			for (ep of data.endpoints) {
				var s;
				var eps = ep.split(' ');
				if (eps.shift() != 'BASIC_MERKLED_API')
					continue;
				port = parseInt(eps.pop());
				for (s of eps) {
					addresses.push(s);
					if (s.match(/^\d+\.\d+\.\d+\.\d+$/))
						ipv4 = s;
					if (s.match(/^[0-9a-fA-F]{1,4}:/))
						ipv6 = s;
				}
			}
			//console.log(addresses);
			//console.log(ipv4);
			//console.log(ipv6);
			if ((ipv4 || ipv6) && !inPeers(data.pubkey)) {
				var geo = null;
				if (ipv4)
					geo = geoip.lookup(ipv4);
				else if (ipv6)
					geo = geoip.lookup(ipv6);
				//console.log(geo);
				if (geo)
					addPeer(data.pubkey, geo, addresses, port, status);
			}
		}
	} catch (e) {
		// En cas d'exception, afficher le message
		console.log(e);
	}


	const httpServer = http.createServer(app);
	httpServer.listen(PORT, HOST);
	console.log("Web server at http://%s:%s", HOST, PORT);
	console.log("GeoJSON data at http://%s:%s/peers.geojson", HOST, PORT);

	duniterServer.pipe(es.mapSync((data) => {
		if (data.documentType == 'peer') {
			console.log('>> New peer document !');
			//console.log(data);
			var ipv4 = data.getIPv4();
			var ipv6 = data.getIPv6();
			var port = data.getPort();
			var addresses = [];
			if (ipv4)
				addresses.push(ipv4);
			if (ipv6)
				addresses.push(ipv6);
			//console.log(addresses);
			//console.log(ipv4);
			//console.log(ipv6);
			if ((ipv4 || ipv6) && !inPeers(data.pubkey)) {
				var geo = null;
				if (ipv4)
					gep = geoip.lookup(ipv4);
				else if (ipv6)
					gep = geoip.lookup(ipv6);
				//console.log(geo);
				if (geo)
					addPeer(data.pubkey, geo, addresses, port, "UP");
			}
		}
		else if (data.documentType == 'block')
			console.log('>> New block !');
		else
			console.log('>> New data !');
	}));

	/****************************************/

	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}));
