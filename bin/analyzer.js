var util = require('./util.js');
var XRegExp = require('xregexp').XRegExp;

var reg_cfr_failure  = [
    XRegExp('^\\s*\\/\\*[a-zA-Z\\*\\s]*?Unable to fully structure code[a-zA-Z\\*\\s]*?\\*\\/', 'mg'),
    XRegExp('^\\s*\\/\\*[\\*\\s]*Exception decompiling[\\*\\s]*\\*\\/', 'mg')
];
var reg_package_name = XRegExp('^\\s*package\\s(?<name>[a-zA-Z0-9_\\.]+);\\s*$', 'mn');
var reg_import       = XRegExp('^\\s*import\\s(?<path>[a-zA-Z0-9_\\.]+);\\s*$', 'mng');
var reg_import_cls   = XRegExp('\\.(?<cls>[a-zA-Z0-9_]+)$');
var reg_class        = XRegExp('^\\s*(?<decorator>((public|final|abstract)\\s)?(strictfp\\s)?)(?<type>class|interface)\\s(?<name>[a-zA-Z0-9_]+)\\s', 'mng');
var reg_method       = XRegExp('^\\s*(?<decorator>((public|protected|private|abstract|final|static|native|synchronized|strictfp)\\s)*)((?<ret>[a-zA-Z0-9_\\.]+)\\s)?(?<name>[a-zA-Z0-9_]+)\\s*\\((?<argv>[^\\)]*)\\)', 'mng');
var reg_method_argv  = XRegExp('(?<type>[a-zA-Z0-9_\\.]+)\\s+(?<name>[a-zA-Z0-9_]+)', 'ng');

var analyzer = {
    
    getMatchedBracketIndex: function(source, startIndex)
    {
        if (source.substr(startIndex, 1) !== '{') {
            throw new Error('Position must start at chat "{"');
        }
        
        var pos = startIndex;
        
        var mode_string = false, 
            mode_string_escape = false,
            mode_line_comment = false,
            mode_block_comment = false;
        
        var stop_analyze = false;
        var depth = 0;
        
        var lastch = null, ch = null;
        
        while (pos < source.length && !stop_analyze) {
            lastch = ch;
            ch = source.substr(pos++, 1);
            
            // string
            if (mode_string) {
                if (mode_string_escape) {
                    mode_string_escape = false;
                } else if (ch === '\\') {
                    mode_string_escape = true;
                } else if (ch === '"') {
                    mode_string = false;
                }
                continue;
            }
            // line comments
            if (mode_line_comment) {
                if (ch === '\n') {
                    mode_line_comment = false;
                }
                continue;
            }
            // block comments
            if (mode_block_comment) {
                if (lastch === '*' && ch === '/') {
                    mode_block_comment = false;
                }
                continue;
            }
            
            switch(ch) {
                case '"':
                    if (!mode_string) {
                        mode_string = true;
                    }
                    break;
                case '/':
                    if (lastch === '/') {
                        mode_line_comment = true;
                    }
                    break;
                case '*':
                    if (lastch === '/') {
                        mode_block_comment = true;
                    }
                    break;
                case '{':
                    depth++;
                    break;
                case '}':
                    depth--;
                    if (depth === 0) {
                        stop_analyze = true;
                    }
                    break;
            }
        }
        
        return (pos - 1);
    },
    
    getPackageName: function(source)
    {
        var match = XRegExp.exec(source, reg_package_name);
        
        if (match) {
            return match.name;
        } else {
            throw new Error('Failed to extract package name');
        }
    },
    
    getImports: function(source)
    {
        var imports = [];
        var classes = {};

        XRegExp.forEach(source, reg_import, function(match) {
            var mcls = XRegExp.exec(match.path, reg_import_cls);
            imports.push({
                path: match.path,
                name: mcls.cls
            });
            
            if (classes[mcls.cls] === undefined) {
                classes[mcls.cls] = 1;
            } else {
                classes[mcls.cls]++;
            }
        });

        // remove invalid imports
        var ret = [];
        imports.forEach(function(importEntity) {
            if (classes[importEntity.name] === 1) {
                ret.push(importEntity);
            }
        })
        
        return ret;
    },
    
    getClasses: function(source)
    {
        var classes = [];
        
        var match, pos = 0;
        
        while (match = XRegExp.exec(source, reg_class, pos)) {
            
            var bracket_begin = source.indexOf('{', match.index + match[0].length);
            var bracket_end   = analyzer.getMatchedBracketIndex(source, bracket_begin);
            
            var cls = {
                decorator:      match.decorator.trim().split(/\s+/),
                type:           match.type,
                name:           match.name,
                beginIndex:     match.index,
                endIndex:       bracket_end,
                bodyBeginIndex: bracket_begin,
                bodyEndIndex:   bracket_end
            };
            
            cls.all  = source.substring(cls.beginIndex, cls.endIndex + 1);
            cls.body = source.substring(cls.bodyBeginIndex + 1, cls.bodyEndIndex);
            
            classes.push(cls);
            
            pos = bracket_end + 1;
        }
        
        return classes;
    },
    
    getMethodFromMatch: function(source, match)
    {
        var argv = [];
        XRegExp.forEach(match.argv, reg_method_argv, function(match) {
            argv.push({
                name: match.name,
                type: match.type
            });
        });
        
        var bracket_begin = source.indexOf('{', match.index + match[0].length);
        var bracket_end   = analyzer.getMatchedBracketIndex(source, bracket_begin);
        
        var m = {
            decorator:      match.decorator.trim().split(/\s+/),
            ret:            match.ret,
            name:           match.name,
            argv:           argv,
            beginIndex:     match.index,
            endIndex:       bracket_end,
            bodyBeginIndex: bracket_begin,
            bodyEndIndex:   bracket_end
        };
        
        m.all  = source.substring(m.beginIndex, m.endIndex + 1);
        m.body = source.substring(m.bodyBeginIndex + 1, m.bodyEndIndex);
        
        return m;
    },
    
    getMethodAt: function(source, startIndex)
    {
        var src = source.substr(startIndex);
        var leadingWhitespace = src.length - src.trim().length;
        
        var match = XRegExp.exec(src.trim(), reg_method);
        
        if (match) {
            var method = analyzer.getMethodFromMatch(src, match);
            method.beginIndex     += startIndex + leadingWhitespace;
            method.bodyBeginIndex += startIndex + leadingWhitespace;
            return method;
        } else {
            return null;
        }
    },
    
    getMethods: function(source)
    {
        var methods = [];
        
        var match, pos = 0;
        
        while (match = XRegExp.exec(source, reg_method, pos)) {
            var m = analyzer.getMethodFromMatch(source, match);
            methods.push(m);
            pos = m.endIndex + 1;
        }
        
        return methods;
    },
    
    getClassFullPath: function(name, imports)
    {
        if (name.indexOf('java.lang.') === 0) {
            return name.substr(10);
        }

        if (!imports) {
            return name;
        }

        for (var i = 0; i < imports.length; ++i) {
            if (util.endsWith(imports[i].path, '.' + name)) {
                return imports[i].path;
            }
        }
        
        return name;
    },
    
    getMethodSignature: function(methodName, argv, className, imports)
    {
        var p = argv.map(function(v) {
            return analyzer.getClassFullPath(v.type, imports);
        });
                
        return className + '.' + methodName + '(' + p.join(', ') + ')';
    },

    getSimplifiedCode: function(source, imports)
    {
        // TODO: More accurate replacement
        
        var cloned = source;

        imports.forEach(function(importEntity) {
            cloned = XRegExp.replace(cloned, importEntity.path, importEntity.name, 'all');
        });

        return cloned;
    },

    cfr_analyze: function(options, resultBucket, callback)
    {
        var decompiled = resultBucket.cfr_decompiled;

        // match decompiling failures
        resultBucket.completed = true;
        
        for (var i = 0; i < reg_cfr_failure.length; ++i) {
            if (XRegExp.test(decompiled, reg_cfr_failure[i])) {
                resultBucket.completed = false;
                break;
            }
        }
        
        callback();
    },

    krakatau_analyze: function(options, resultBucket, callback)
    {
        if (resultBucket.krakatau_decompiled === null) {
            return callback();
        }

        var src_cfr = resultBucket.cfr_decompiled;
        src_cfr = src_cfr.replace(/\s\/\*\ssynthetic\s\*\/\s/g, ' ');
        
        // 1. get imports & full class names
        var imports = analyzer.getImports(src_cfr);
        var packageName = analyzer.getPackageName(src_cfr);
        
        var classes = analyzer.getClasses(src_cfr);
        classes.forEach(function(cls) {
            imports.push({
                path: packageName + '.' + cls.name,
                name: cls.name
            });
        });
        
        // 2. find all failed functions
        var failedMethods = {};
        
        classes.forEach(function(cls) {
            reg_cfr_failure.forEach(function(reg) {
                XRegExp.forEach(cls.body, reg, function(match) {
                    var m = analyzer.getMethodAt(cls.body, match.index + match[0].length);
                    if (m) {
                        var sign = analyzer.getMethodSignature(m.name, m.argv, cls.name, imports);
                        failedMethods[sign] = m;
                    } else {
                        console.log('Failed to extract method at %d', match.index);
                    }
                });
            });
        });

        // 3. iterate methods in krakatau decompiled classes
        var src_k = resultBucket.krakatau_decompiled;
        var classes_k = analyzer.getClasses(src_k);

        classes_k.forEach(function(cls) {
            var methods = analyzer.getMethods(cls.body);
            methods.forEach(function(m) {
                // no imports in Krakatau decompiled sources
                var sign = analyzer.getMethodSignature(m.name, m.argv, cls.name);
                if (failedMethods[sign]) {
                    src_cfr = src_cfr.replace(failedMethods[sign].all, analyzer.getSimplifiedCode(m.all, imports));
                }
            })
        });

        resultBucket.cfr_decompiled = src_cfr;

        callback();
    }

};

module.exports = analyzer;