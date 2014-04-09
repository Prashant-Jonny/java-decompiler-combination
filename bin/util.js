var fs = require('fs');
var util = require('util');

var u = {

    // check file existance
    isExist: function(filename)
    {
        try {
            fs.statSync(filename);
        } catch (err) {
            return false;
        }
        return true;
    },

    endsWith: function(str, suffix)
    {
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }

};

// copy functions
for (var foo in util) {
    if (typeof util[foo] === 'function') {
        u[foo] = util[foo];
    }
}

module.exports = u;