var get = require('./get');

/**
 * Load an image from a URL for use as a custom marker.
 *
 * @param {object} options
 * @param {function} callback
 */
module.exports = function(options, callback) {
    var uri = options.label;

    if (options.tint) {
        // Expand hex shorthand (3 chars) to 6, e.g. 333 => 333333.
        // This is not done upstream in `node-tint` as some such
        // shorthand cannot be disambiguated from other tintspec strings,
        // e.g. 123 (rgb shorthand) vs. 123 (hue).
        if (options.tint.length === 3) options.tint =
            options.tint[0] + options.tint[0] +
            options.tint[1] + options.tint[1] +
            options.tint[2] + options.tint[2];
        options.parsedTint = blend.parseTintString(options.tint);
    }

    if (uri.substring(0, 4) !== 'http') uri = 'http://' + uri;

    get(uri, uri, function(err, data) {
        if (err) return callback(err);

        // Check for PNG header.
        if (data.toString('binary', 0, 8) !== '\x89\x50\x4E\x47\x0D\x0A\x1A\x0A') {
            return callback(new ErrorHTTP('Marker image format is not supported.', 415));
        }

        // Extract width and height from the IHDR. The IHDR chunk must appear
        // first, so the location is always fixed.
        var width = data.readUInt32BE(16),
            height = data.readUInt32BE(20);

        // Check image size. 400x400 square limit.
        if (width * height > 160000) {
            return callback(new ErrorHTTP('Marker image size must not exceed 160000 pixels.', 415));
        }

        if (!options.parsedTint) return callback(null, {
            image: data,
            size: data.length,
            width: width,
            height: height
        });

        blend([{
            buffer:data,
            tint: options.parsedTint
        }], {}, function(err, tinted) {
            if (err) return callback(err);
            return callback(null, {
                image: tinted,
                size: data.length,
                width: width,
                height: height
            });
        });
    });
};
