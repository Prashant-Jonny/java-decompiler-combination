java-decompiler-combination
===========================

Combine [CFR](www.benf.org/other/cfr/) and [Krakatau](https://github.com/Storyyeller/Krakatau) decompilation results to generate better source code.

## Dependencies

- [CFR](www.benf.org/other/cfr/) (JRE)
- [Krakatau](https://github.com/Storyyeller/Krakatau/) (Python2.7, JDK)

Install dependencies:

```
npm install
cd lib
wget http://www.benf.org/other/cfr/cfr_0_79.jar -O cfr.jar
git clone https://github.com/Storyyeller/Krakatau.git
```

## Usage

```
node jdc.js BASE_DIR CLASS_PATH [--lib LIB_DIR] [--path PATH] [--output OUTPUT_FILE]

BASE_DIR:             The base directory containing class files

CLASS_PATH:           The Java path of the class to be decompiled
                      (e.g. com/myproject/myclass)

--lib LIB_DIR:        3rd-party libraries directory

--path PATH:          An optional list of directories, jars, or zipfiles
                      to search for classes in for Krakatau

--output OUTPUT_FILE: Output to the file (default stdout)
```

## License

MIT License