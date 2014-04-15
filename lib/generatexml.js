var normalize = require('geojson-normalize'),
    PROJ = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over",
    WGS84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs",
    HEADER = '<?xml version="1.0" encoding="utf-8"?>' +
    '<Map srs="' + PROJ + '">',
    FOOTER = '</Map>';

var styleMap = {
    'stroke': ['LineSymbolizer', 'stroke'],
    'stroke-opacity': ['LineSymbolizer', 'stroke-opacity'],
    'stroke-width': ['LineSymbolizer', 'stroke-width'],
    'fill': ['PolygonSymbolizer', 'fill'],
    'fill-opacity': ['PolygonSymbolizer', 'opacity']
};

var defaultFilled = {
    fill: '#555555',
    'fill-opacity': 0.5
};

var defaultStroked = {
    stroke: '#555555',
    'stroke-width': 2,
    'stroke-opacity': 1,
};

var typedDefaults = {
    LineString: defaultStroked,
    MultiLineString: defaultStroked,
    Polygon: defaultFilled,
    MultiPolygon: defaultFilled
};

/**
 * @param {object} data a geojson object
 * @returns {string} a mapnik style
 */
module.exports = function generateXML(data, TMP) {
    var gj = normalize(data);
    if (!gj) return null;
    var ls = gj.features.map(convertFeature(TMP));

    return {
        xml: HEADER +
            ls.map(function(_) { return _.style; }).join('') +
            ls.map(function(_) { return _.layer; }).join('') +
            FOOTER,
        resources: ls.reduce(function(mem, _) {
            return mem.concat(_.resources);
        }, [])
    };
};

/**
 * @param {object} feature
 * @returns {string}
 */
function markerString(feature) {
    var fp = feature.properties || {},
        size = fp['marker-size'] || 'medium',
        symbol = (fp['marker-symbol']) ? '-' + fp['marker-symbol'] : '',
        color = (fp['marker-color'] || '7e7e7e').replace('#', '');

    return 'pin-' + size.charAt(0) + symbol + '+' + color;
}

/**
 * @param {object} feature
 * @returns {string}
 */
function markerURL(feature) {
    return (feature.properties || {})['marker-url'];
}

/**
 * @param {object} feature geojson feature
 * @returns {object}
 */
function convertFeature(TMP) {
    return function(feature, i) {
        var style = generateStyle(feature, i, TMP);
        return {
            style: style.style,
            resources: style.resources,
            layer: generateLayer(feature, i)
        };
    };
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {object}
 */
function fallback(a, b) {
    var c = {};
    for (var k in b) {
        if (a[k] === undefined) c[k] = b[k];
        else c[k] = a[k];
    }
    return c;
}

/**
 * @param {object} feature geojson feature
 * @returns {string}
 */
function generateStyle(feature, i, TMP) {
    var defaults = typedDefaults[feature.geometry.type] || {},
        props = pairs(fallback(feature.properties || {}, defaults)),
        symbolizerGroups = props.reduce(collectSymbolizers, {}),
        markerStyle = '',
        resources = [];

    if (feature.geometry.type === 'Point' ||
        feature.geometry.type === 'MultiPoint') {
        if (markerURL(feature)) {
            resources.push(markerURL(feature));
            markerStyle = tagClose('PointSymbolizer', [
                ['file', TMP + markerString(feature)]
            ]);
        } else {
            resources.push(markerString(feature));
            markerStyle = tagClose('PointSymbolizer', [
                ['file', TMP + '/' + markerString(feature) + '.png']
            ]);
        }
    }

    return {
        style: tag('Style',
            tag('Rule',
            pairs(symbolizerGroups)
                .map(function(symbolizer) {
                    return tagClose(symbolizer[0], pairs(symbolizer[1]));
                }) + markerStyle),
                [['name', 'style-' + i]]),
        resources: resources
    };
}

/**
 * @param {object} mem
 * @param {array} prop
 * @returns {object}
 */
function collectSymbolizers(mem, prop) {
    var mapped = styleMap[prop[0]];
    if (mapped) {
        if (!mem[mapped[0]]) mem[mapped[0]] = {};
        mem[mapped[0]][mapped[1]] = prop[1];
    }
    return mem;
}

/**
 * @param {object} feature geojson feature
 * @returns {string}
 */
function generateLayer(feature, i) {
    if (!feature.geometry) return null;

    return tag('Layer',
        tag('StyleName', 'style-' + i) +
        tag('Datasource',
            [
                ['type', 'ogr'],
                ['layer_by_index', '0'],
                ['driver', 'GeoJson'],
                ['string', JSON.stringify(feature.geometry)]
            ].map(function(a) {
                return tag('Parameter', a[1], [['name', a[0]]]);
            }).join('')), [
                ['name', 'layer-' + i],
                ['srs', WGS84]
            ]);
}

/**
 * @param {object} o
 * @returns {array}
 */
function pairs(o) {
    return Object.keys(o).map(function(k) {
        return [k, o[k]];
    });
}

/**
 * @param {array} _ an array of attributes
 * @returns {string}
 */
function attr(_) {
    return (_ && _.length) ? (' ' + _.map(function(a) {
        return a[0] + '="' + a[1] + '"';
    }).join(' ')) : '';
}

/**
 * @param {string} el element name
 * @param {array} attributes array of pairs
 * @returns {string}
 */
function tagClose(el, attributes) {
    return '<' + el + attr(attributes) + '/>';
}

/**
 * @param {string} el element name
 * @param {string} contents innerXML
 * @param {array} attributes array of pairs
 * @returns {string}
 */
function tag(el, contents, attributes) {
    return '<' + el + attr(attributes) + '>' + contents + '</' + el + '>';
}

/**
 * @param {string} _ a string of attribute
 * @returns {string}
 */
function encode(_) {
    return (_ === null ? '' : _.toString()).replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
