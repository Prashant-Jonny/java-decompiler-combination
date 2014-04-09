var argv = require('optimist')
    .usage('Usage: $0 BASE_DIR CLASS_PATH [--lib LIB_DIR] [--path PATH] [--output OUTPUT_FILE]')
    .demand(2)
    .argv;
var fs = require('fs');
var path = require('path');

var util = require('./bin/util.js');
var decompiler = require('./bin/decompiler.js');

try {
    // check libraries
    var libDir = path.resolve(argv.lib ? argv.lib : 'lib');

    var libCfr = path.join(libDir, 'cfr.jar');
    var libKrakatau = path.join(libDir, 'Krakatau/decompile.py');
    if (!util.isExist(libCfr)) {
        throw new Error('File not found: ' + libCfr);
    }
    if (!util.isExist(libKrakatau)) {
        throw new Error('File not found: ' + libKrakatau);
    }

    // check base_dir existance
    var baseDir = path.resolve(argv._[0]);

    if (!util.isExist(baseDir)) {
        throw new Error('Couldn\'t find base directory: ' + baseDir);
    }

    // check class_file existance
    var classPath = argv._[1].replace(/\\/g, '/').replace(/^\/*/, '');
    if (util.endsWith(argv._[1], '.class')) {
        throw new Error('CLASS_PATH should not ends with ".class"');
    }

    var classFile = path.join(baseDir, classPath + '.class');

    if (!util.isExist(classFile)) {
        throw new Error('Couldn\'t find class file: ' + classFile + ' (base_dir: ' + baseDir + '; class_path: ' + classPath + ')');
    }

    // create temp directory
    var tempDir = path.resolve('.temp');
    if (!util.isExist(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    var options = {
        lib: {
            cfr:        libCfr,
            krakatau:   libKrakatau
        },
        baseDir:    baseDir,
        classPath:  classPath,
        tempDir:    tempDir
    };

    if (argv.path) {
        var glob = require('glob');
        options.path = glob.sync(argv.path);
    }

    // decompile!
    decompiler.decompile(options, function(err, result)
    {
        if (err) {
            console.error(err.stack);
            return;
        }

        if (argv.output) {
            var mkdirp = require('mkdirp');
            mkdirp(path.dirname(argv.output), function(err) {
                if (err) {
                    console.error(err.stack);
                    return;
                }
                fs.writeFileSync(argv.output, result);
            });
        } else {
            console.log(result);
        }
    });
} catch (err) {
    console.error(err.stack);
}
