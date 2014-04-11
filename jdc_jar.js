var argv = require('optimist')
    .usage('Usage: $0 JAR_PATH|CLASS_DIRECTORY --output OUTPUT_DIR [--lib LIB_DIR] [--path PATH] [--force]')
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

    var targetJar, jarName, outputDir;

    if (fs.lstatSync(targetPath).isDirectory()) {
        targetJar = false;
        outputDir = path.resolve(path.join(argv.output, path.basename(targetPath)));
    } else {
        targetJar = true;

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

    if (targetJar) {
        var zip = new admZip(jarPath);
        extractDir = path.join(tempDir, jarName);

        // clean old files
        if (util.isExist(extractDir)) {
            console.log('Cleanning...');
            rmdir.sync(extractDir);
        }

        // extract jar
        console.log('Extracting...');
        zip.extractAllTo(extractDir);
    } else {
        extractDir = targetPath;
    }
    
    // walk all files & decompile
    var walker = walk.walk(extractDir);
    
    walker.on('directories', function(root, dirStatsArray, next) {
        var packagePath = root.substr(extractDir.length + 1);
        if (packagePath.length > 0) {
            try {
                fs.mkdirSync(path.join(outputDir, packagePath));
            } catch(e) {}
        }
        next();
    });

    walker.on('file', function(root, fileStats, next) {
        var ext = path.extname(fileStats.name);
        if (ext.toLowerCase() !== '.class') {
            return next();
        }

        var fileName = path.basename(fileStats.name, ext);
        var packagePath = root.substr(extractDir.length + 1);
        var classPath = path.join(packagePath, fileName);

        console.log(classPath.split(path.sep).join('.'));

        var v = [extractDir, classPath, '--output', path.join(outputDir, packagePath, fileName + '.java')];
        if (argv.lib) {
            v.push('--lib', argv.lib);
        }
        if (argv.path) {
            v.push('--path', argv.path);
        }
        var child = child_process.fork('./jdc.js', v);
        child.on('close', function() {
            next();
        });
    });
} catch (err) {
    console.error(err.stack);
}