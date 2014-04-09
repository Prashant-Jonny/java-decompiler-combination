var util = require('./util.js');
var analyzer = require('./analyzer.js');
var async = require('async');
var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;

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
                decompiler.cfr_decompile(options, r, callback);
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