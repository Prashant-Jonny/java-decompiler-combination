var util = require('./util.js');
var analyzer = require('./analyzer.js');
var async = require('async');
var path = require('path');
var fs = require('fs');
var readline = require('readline');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

var execOptions = {
    maxBuffer: 5*1024*1024  // 5MiB
};

var decompiler = {

    decompile: function(options, callback)
    {
        var r = {};

        async.series([
            function(callback)
            {
                if (options.cfrFile) {
                    r.cfr_decompiled = fs.readFileSync(options.cfrFile).toString();
                    callback();
                } else {
                    decompiler.cfr_decompile(options, r, callback);
                }
            },
            function(callback)
            {
                analyzer.cfr_analyze(options, r, callback);
            },
            function(callback)
            {
                if (r.completed) {
                    return callback('completed');
                }

                decompiler.krakatau_decompile(options, r, callback);
            },
            function(callback)
            {
                analyzer.krakatau_analyze(options, r, callback);
            }
        ], function(err)
        {
            if (!err || err === 'completed') {
                callback(null, r.cfr_decompiled);
            } else {
                callback(err);
            }
        });
    },

    cfr_decompile_jar: function(options, callback)
    {
        var outputBaseDir = path.join(options.tempDir, 'cfr_decompiled');
        var cfr = spawn('java', ['-jar', options.lib.cfr, options.jarFile, '--outputdir', outputBaseDir]);

        var linereader = readline.createInterface({
            input:    cfr.stderr,
            terminal: false
        });

        cfr.on('close', function (code) {
            callback(null, outputBaseDir);
        });

        return linereader;
    },

    cfr_decompile: function(options, resultBucket, callback)
    {
        var classFile = path.join(options.baseDir, options.classPath.replace(/\$/g, '\\$') + '.class');

        var cfr = exec(util.format(
            'java -jar "%s" "%s"',
            options.lib.cfr,
            classFile
        ), execOptions, function(error, stdout, stderr)
        {
            if (error) {
                return callback(error);
            }
            resultBucket.cfr_decompiled = stdout;
            callback();
        });
    },

    krakatau_decompile: function(options, resultBucket, callback)
    {
        var outputBaseDir = path.join(options.tempDir, 'krakatau_decompiled');
        var outputSrcFile = path.join(outputBaseDir, options.classPath + '.java');

        if (util.isExist(outputSrcFile)) {
            fs.unlinkSync(outputSrcFile);
        }

        var argv_path = [options.baseDir];
        if (options.path) {
            options.path.forEach(function(p) {
                argv_path.push(p);
            });
        }

        var krakatau = exec(util.format(
            'python "%s" -path "%s" -skip -out "%s" %s',
            options.lib.krakatau,
            argv_path.join(';'),
            outputBaseDir,
            options.classPath.replace(/\$/g, '\\$')
        ), execOptions, function(error, stdout, stderr)
        {
            if (error) {
                return callback(error);
            }

            fs.readFile(outputSrcFile, function(error, data)
            {
                if (error) {
                    var m = /^failed to decompile.*$/m.exec(stdout);
                    if (m) {
                        console.log('Krakatau: %s', m[0]);
                    } else {
                        console.log(stdout);
                    }
                    resultBucket.krakatau_decompiled = null;
                    return callback();
                }
                resultBucket.krakatau_decompiled = data.toString();
                callback();
            });
        });
    }

};

module.exports = decompiler;