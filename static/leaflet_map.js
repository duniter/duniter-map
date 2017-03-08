
function initialize_map() {
    var map = L.map('duniter-leaflet-map');

    // TODO make tile server configurable.
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: '<a href="https://github.com/mmuman/duniter-map">Duniter-map</a> | &#169; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
	map.fitWorld();

	var upIcon = L.icon({
		iconUrl: '/images/duniter_up.png',
		iconSize: [25, 25],
		iconAnchor: [12, 25],
		popupAnchor: [0, -20]
    });
	var downIcon = L.icon({
		iconUrl: '/images/duniter_down.png',
		iconSize: [25, 25],
		iconAnchor: [12, 25],
		popupAnchor: [0, -20]
    });

	var server = "localhost:10500"; // TODO check url fragment

	var peers = null;

	var httpRequest = (window.XMLHttpRequest) ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
	httpRequest.onreadystatechange = function() {
		if (httpRequest.readyState === 4 && (httpRequest.status === 200 || httpRequest.status === 0)) {
			var data = JSON.parse(httpRequest.responseText);
			var p;
			var g = L.geoJSON(data, {
				pointToLayer: function(feature, latlng) {
					var icon = downIcon;
					if (feature.properties.status == "UP")
						icon = upIcon;
					return L.marker(latlng, {icon: icon});
				},
				style: function (feature) {
					return {color: feature.properties.color};
				}
			}).bindPopup(function (layer) {
				var t = '<div class="marker">';
				t += '<h5>'+layer.feature.properties.pubkey +'</h5>';
				t += '('+layer.feature.properties.status+')<br />';
				t += 'Addresses:<br />';
				t += '<code>'+layer.feature.properties.addresses.join('<br />') +'</code><br/>';
				t += 'Port: <code>'+layer.feature.properties.port+'</code><br />';
				t += '</div>';
				return t;
			}).addTo(map);
			var bounds = g.getBounds();
			if (bounds) {
				bounds.pad(2);
				map.fitBounds(bounds);
			} else
				map.fitWorld();
		}
	};
	httpRequest.open('GET', /*"http://" + server +*/ "/peers.geojson");
	httpRequest.send();

	return;
}

document.body.onload=initialize_map();
