var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var process = require("process");
var gm = require('gm');
var appRoot = require('app-root-path');
var argv = require('minimist')(process.argv.slice(2));

var sortFunction;
var projectRoot = appRoot.path;
var toConvertAbsoluteBasePath;
var assetsAbsoluteBasePath = projectRoot + "/src/assets/img/gallery/";
var previewRelativePath = "assets/img/gallery/";
var imageMetadataArray = [];
var resolutions = [
    {name: 'preview_xxs', height: 375},
    {name: 'preview_xs', height: 768},
    {name: 'preview_s', height: 1080},
    {name: 'preview_m', height: 1600},
    {name: 'preview_l', height: 2160},
    {name: 'preview_xl', height: 2880},
    {name: 'raw', height: undefined}
];

function init() {
    if (argv['_'].length == 0) {
        toConvertAbsoluteBasePath = projectRoot + "/images_to_convert";
        console.log('No path specified! Defaulting to ' + toConvertAbsoluteBasePath)
    } else if (argv['_'].length > 1) {
        console.log('Illegally specified more than one argument!')
    }
    else {
        toConvertAbsoluteBasePath = argv._[0]
    }
    if (!argv['d'] && !argv['n']) {
        console.log('No sorting mechanism specified! Default mode will be sorting by file name.');
        sortFunction = sortByFileName;
    }
    if (argv['d']) {
        sortFunction = sortByCreationDate;
        console.log('Going to sort images by actual creation time (EXIF).');
    }
    if (argv['n']) {
        sortFunction = sortByFileName;
        console.log('Going to sort images by file name.');
    }

    convert();
}

function convert() {
    createFolderStructure();

    var files = fs.readdirSync(toConvertAbsoluteBasePath);

    processFiles(files, 0);

    console.log('\nConverting images...');
}

function createFolderStructure() {
    console.log('\nCreating folder structure...');
    mkdirp.sync(assetsAbsoluteBasePath + 'raw', function (err) {
        if (err) throw err;
    });

    for (var i in resolutions) {
        mkdirp.sync(assetsAbsoluteBasePath + resolutions[i].name, function (err) {
            if (err) throw err;
        });
    }

    console.log('...done (folder structure)');
}

function processFiles(files, fidx) {
    if (fidx < files.length) {
        var file = files[fidx];
        if (file != '.gitignore') {
            var filePath = path.join(toConvertAbsoluteBasePath, file);
            if (fs.lstatSync(filePath).isFile()) {
                identifyImage(files, fidx, filePath, file);
            }
            else {
                processFiles(files, ++fidx);
            }
        }
        else {
            processFiles(files, ++fidx);
        }
    }
    else {
        console.log('\n\nProviding image information...')
        provideImageInformation(imageMetadataArray, 0, resolutions, 0);
    }
}

function identifyImage(files, fidx, filePath, file) {
    gm(filePath)
        .identify(function (err, features) {
            if (err) {
                console.log(filePath)
                console.log(err)
                throw err;
            }

            var dateTimeOriginal = undefined;
            if (features['Profile-EXIF']) {
                dateTimeOriginal = features['Profile-EXIF']['Date Time Original'];
            }

            var imageMetadata = {
                name: file,
                date: dateTimeOriginal
            };

            imageMetadataArray.push(imageMetadata);

            // copy raw image to assets folder
            fs.createReadStream(filePath).pipe(fs.createWriteStream(assetsAbsoluteBasePath + 'raw/' + file));

            createPreviewImage(files, fidx, filePath, file, 0);
        });
}

function createPreviewImage(files, fidx, filePath, file, index) {
    // create various preview images

    gm(filePath)
        .resize(null, resolutions[index].height)
        .quality(95)
        .write(assetsAbsoluteBasePath + resolutions[index].name + '/' + file, function (err) {
            if (err) throw err;
            if (index !== resolutions.length - 2) {
                // don't resize raw images
                createPreviewImage(files, fidx, filePath, file, ++index);
            } else {
                process.stdout.write('\rConverted ' + (fidx) + " images.");
                processFiles(files, ++fidx);
            }
        });
}

function provideImageInformation(imageMetadataArray, imgMetadataIdx, resolutions, resolutionIdx) {
    var imgMetadata = imageMetadataArray[imgMetadataIdx];
    var resolution = resolutions[resolutionIdx];

    var filePath = assetsAbsoluteBasePath + resolution.name + '/' + imgMetadata.name;

    gm(filePath)
        .size(function (err, size) {
            if (err) {
                console.log(filePath)
                console.log(err)
                throw err;
            }

            imgMetadata[resolution.name] = {};
            imgMetadata[resolution.name]['path'] = previewRelativePath + resolution.name + '/' + imgMetadata.name;
            imgMetadata[resolution.name]['width'] = size.width;
            imgMetadata[resolution.name]['height'] = size.height;

            if (resolutions.length - 1 == resolutionIdx) {
                gm(filePath)
                    .resize(250, 250)
                    .colors(1)
                    .toBuffer('RGB', function (err, buffer) {
                        if (err) throw err;
                        imgMetadata['dominantColor'] = '#' + buffer.slice(0, 3).toString('hex');

                        if (imageMetadataArray.length - 1 == imgMetadataIdx) {
                            console.log('...done (information)');
                            sortFunction();
                        }
                        else {
                            provideImageInformation(imageMetadataArray, ++imgMetadataIdx, resolutions, 0);
                        }
                    });
            }
            else {
                provideImageInformation(imageMetadataArray, imgMetadataIdx, resolutions, ++resolutionIdx);
            }
        });
}

function sortByCreationDate() {
    console.log('\nSorting images by actual creation time...');

    imageMetadataArray.sort(function (a, b) {
        if (a.date > b.date) {
            return 1;
        } else if (a.date == b.date) {
            return 0;
        } else {
            return -1;
        }
    });
    console.log('...done (sorting)');

    saveMetadataFile();
}

function sortByFileName() {
    console.log('\nSorting images by file name...');

    imageMetadataArray.sort(function (a, b) {
        if (a.name > b.name) {
            return 1;
        } else if (a.name == b.name) {
            return 0;
        } else {
            return -1;
        }
    });
    console.log('...done (sorting)');

    saveMetadataFile();
}

function saveMetadataFile() {
    var metadataAsJSON = JSON.stringify(imageMetadataArray, null, null);
    console.log('\nSaving metadata file...');

    fs.writeFile(assetsAbsoluteBasePath + 'data.json', metadataAsJSON, function (err) {
        if (err) throw err;
        console.log('...done (metadata)');
    });
}

init();
