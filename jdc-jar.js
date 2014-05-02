var argv = require('optimist')
    .usage('Usage: $0 JAR_PATH --output OUTPUT_DIR [--lib LIB_DIR] [--path PATH] [--force]')
    .alias('o', 'output')
    .alias('l', 'lib')
    .alias('p', 'path')
    .alias('f', 'force')
    .demand('o')
    .demand(1)
    .describe('o', 'The output file')
    .describe('l', '3rd-party libraries directory')
    .describe('p', 'A list of directories, jars, or zipfiles')
    .describe('f', 'Overwrite output directory')
    .argv;
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var walk = require('walk');
var admZip = require('adm-zip');
var rmdir = require('rimraf');
var mkdirp = require('mkdirp');

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

    // check jar
    var targetPath = path.resolve(argv._[0]);

    if (!util.isExist(targetPath)) {
        throw new Error('Couldn\'t find jar file or class directory: ' + targetPath);
    }

    var jarName, outputDir;

    if (fs.lstatSync(targetPath).isDirectory()) {
        throw new Error('Accept jar files only: ' + targetPath);
    } else {
        if (path.extname(targetPath).toLowerCase() !== '.jar') {
            throw new Error('Accept jar files only: ' + targetPath);
        }

        jarName = path.basename(targetPath, path.extname(targetPath));
        outputDir = path.resolve(path.join(argv.output, jarName))
    }

    // check output dir
    if (util.isExist(outputDir)) {
        try {
            fs.rmdirSync(outputDir);
        } catch (err) {
            if (err.code === 'ENOTEMPTY') {
                if (!argv.force) {
                    throw new Error('Output directory already exists, use --force to overwrite.');
                } else {
                    rmdir.sync(outputDir);
                }
            } else {
                throw err;
            }
        }
    }

    mkdirp.sync(outputDir);

    // create temp directory
    var tempDir = path.resolve('.temp');
    if (!util.isExist(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    var extractDir;

    var zip = new admZip(targetPath);
    extractDir = path.join(tempDir, jarName);

    // clean old files
    if (util.isExist(extractDir)) {
        console.log('Cleanning...');
        rmdir.sync(extractDir);
    }

    // extract jar
    console.log('Extracting...');
    zip.extractAllTo(extractDir);

    console.log('[Stage 1/2] CFR decompiling...');

    var reader = decompiler.cfr_decompile_jar({
        lib: { cfr: libCfr },
        jarFile: targetPath,
        tempDir: tempDir
    }, function(err, cfrDir)
    {
        if (err) {
            console.error(err.stack);
            return;
        }

        console.log('[Stage 2/2] Krakatau decompiling...');

        var walker = walk.walk(extractDir);

        var options = {
            lib: { krakatau: libKrakatau },
            baseDir:    extractDir,
            tempDir:    tempDir,
        };

        if (argv.path && typeof argv.path === 'string') {
            var glob = require('glob');
            options.path = glob.sync(argv.path);
        }

        walker.on('directories', function(root, dirStatsArray, next) {
            dirStatsArray.forEach(function(stat) {
                var packagePath = path.join(root, stat.name).substr(extractDir.length + 1);
                try {
                    fs.mkdirSync(path.join(outputDir, packagePath));
                } catch(e) {}
            });
            
            next();
        });

        walker.on('file', function(root, fileStats, next)
        {
            var ext = path.extname(fileStats.name);
            if (ext.toLowerCase() !== '.class') {
                return next();
            }

            var fileName = path.basename(fileStats.name, ext);
            var packagePath = root.substr(extractDir.length + 1);
            var classPath = path.join(packagePath, fileName);
            var cfrOutputFile = path.join(cfrDir, classPath + '.java');

            console.log('[Stage 2/2] %s', classPath.split(path.sep).join('.'));

            if (util.isExist(cfrOutputFile)) {
                options.classPath = classPath;
                options.cfrFile = cfrOutputFile;

                decompiler.decompile(options, function(err, result)
                {
                    if (err) {
                        console.error(err.stack);
                        next();
                        return;
                    }

                    fs.writeFileSync(path.join(outputDir, classPath + '.java'), result);
                    next();
                })
            } else {
                console.log('Warn: file not found');
                next();
            }
        });
    });

    reader.on('line', function(line)
    {
        console.log('[Stage 1/2] %s', line);
    });
} catch (err) {
    console.error(err.stack);
}