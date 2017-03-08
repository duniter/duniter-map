#!/usr/bin/env node
"use strict";

const co      = require('co');
const es      = require('event-stream');
const duniter = require('duniter');
const http    = require('http');
const path    = require('path');
const express = require('express');
const geoip   = require('geoip-lite');
const natUpnp = require('nnupnp');
const webserver = require('./lib/webserver.js');


var upnpClient = natUpnp.createClient();

// Default Duniter node's database
const HOME_DUNITER_DATA_FOLDER = 'duniter_map';

// Default host on which the map is available
const DEFAULT_HOST = 'localhost';

// Default port on which the map is available
const DEFAULT_PORT = 10500;

var SERVER_HOST;
var SERVER_PORT;
var peerTable = {};
var upnpInterval = null;

function inPeers(pubkey, ipv4, ipv6) {
  var k = ipv4 || ipv6;
  if (k in peerTable)
    return true;
  return false;
}
function addPeer(pubkey, ipv4, ipv6, geo, addresses, port, status) {
  var k = ipv4 || ipv6;
  peerTable[k] = {
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

function upnpMapPort() {
  upnpClient.portMapping({
    'public': SERVER_PORT,
    'private': SERVER_PORT,
    ttl: 600
  }, function(err) {
    // Will be called once finished
    console.log(err);
  });
}

const stack = duniter.statics.autoStack([{
  name: 'duniter-map',
  required: {

    duniter: {

      cliOptions: [
      ],

      cli: [{
        name: 'duniter-map [host] [port]',
        desc: 'Starts duniter-map node',

        // Disables Duniter node's logs
        //logs: false,

        onDatabaseExecute: (duniterServer, conf, program, params, startServices) => co(function*() {
          SERVER_HOST = params[0] || DEFAULT_HOST;
          SERVER_PORT = parseInt(params[1]) || DEFAULT_PORT;

          upnpMapPort();
          upnpInterval = setInterval(upnpMapPort, 1000*300);

          console.log("Resolving initial known peers...");
          try {
            const peers = yield duniterServer.dal.peerDAL.listAll();
            //console.log(peers);
            var data;
            for (data of peers) {
              //var data = peers[pe];
              var status = data.status;
              //TODO: try next one if first resolve failed
              //TODO: handle IPv6 as well
              for (ep of data.endpoints) {
                var ipv4 = null;
                var ipv6 = null;
                var addresses = [];
                var port = "0";
                var ep;
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
                //console.log(addresses);
                //console.log(ipv4);
                //console.log(ipv6);
                if ((ipv4 || ipv6) && !inPeers(data.pubkey, ipv4, ipv6)) {
                  var geo = null;
                  if (ipv4)
                    geo = geoip.lookup(ipv4);
                  else if (ipv6)
                    geo = geoip.lookup(ipv6);
                  //console.log(geo);
                  if (geo)
                    addPeer(data.pubkey, ipv4, ipv6, geo, addresses, port, status);
                }
              }
            }
          } catch (e) {
            // En cas d'exception, afficher le message
            console.log(e);
          }

          // Web server
          let httpServer = webserver(SERVER_HOST, SERVER_PORT, duniterServer, peerTable);
          yield httpServer.openConnection();

          console.log("Web server at http://%s:%s", SERVER_HOST, SERVER_PORT);
          console.log("GeoJSON data at http://%s:%s/peers.geojson", SERVER_HOST, SERVER_PORT);

          // IMPORTANT: release Duniter services from "sleep" mode
          yield startServices();

          // Forward blocks
          duniterServer
            .pipe(es.mapSync(function(data) {
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
                if ((ipv4 || ipv6) && !inPeers(data.pubkey, ipv4, ipv6)) {
                  var geo = null;
                  if (ipv4)
                    gep = geoip.lookup(ipv4);
                  else if (ipv6)
                    gep = geoip.lookup(ipv6);
                  //console.log(geo);
                  if (geo)
                    addPeer(data.pubkey, ipv4, ipv6, geo, addresses, port, "UP");
                }
              }
              else if (data.documentType == 'block')
                console.log('>> New block !');
              else
                console.log('>> New data !');
            }));

          // Wait forever, Remuniter is a permanent program
          yield new Promise(() => null);
        })
      }]
    }
  }
}]);

co(function*() {
  if (!process.argv.includes('--mdb')) {
    // We use the default database
    process.argv.push('--mdb');
    process.argv.push(HOME_DUNITER_DATA_FOLDER);
  }
  // Execute our program
  yield stack.executeStack(process.argv);
  console.log('Removing UPnP NAT mapping...');
  if (upnpInterval)
    clearInterval(upnpInterval);
  upnpClient.portUnmapping({'public': SERVER_HOST});
  // End
  process.exit();
});
