const fs = require('fs-extra');
const path = require('path');
const { glob, globSync } = require('glob');
const _ = require('lodash');
const { Buffer } = require('buffer');

// Utility functions
const readDWord = (buffer, offset) => buffer.readUInt32LE(offset);
const readWord = (buffer, offset) => buffer.readUInt16LE(offset);
const readByte = (buffer, offset) => buffer[offset];

const LOOP_FOREVER = 32767;

const saf4lzss = () => {


    const ensureBufferCapacity = (buffer, currentSize, additionalSize) => {
        if (currentSize + additionalSize > buffer.length) {
            let newLength = buffer.length;
            while (newLength < currentSize + additionalSize) {
                newLength *= 2; // Double the size to reduce the number of resizes needed
            }
            let newBuffer = Buffer.alloc(newLength);
            buffer.copy(newBuffer);
            return newBuffer;
        }
        return buffer;
    };

    const lzssUnpack = (inputBuffer, checkMagic = true) => {
        const F_PACK_MAGIC = 0x53414634;
        const N = 4096;
        const F = 18;
        const THRESHOLD = 2;
        let text_buf = Buffer.alloc(N + F - 1);
        let r = N - F;
        let flags = 0;
        let i, j, k, c;

        let pos = 0;
        let outputBuffer = Buffer.alloc(inputBuffer.length);
        let outputIndex = 0;

        if (checkMagic) {
            const magicNumber = inputBuffer.readUInt32BE(pos);
            pos += 4;
            if (magicNumber !== F_PACK_MAGIC) {
                throw new Error("Invalid file format");
            }
        }

        let size = inputBuffer.length;
        while (pos < size) {
            if (((flags >>= 1) & 256) === 0) {
                c = inputBuffer[pos++];
                flags = c | 0xFF00;
            }
            if (flags & 1) {
                c = inputBuffer[pos++];
                text_buf[r++] = c;
                r &= (N - 1);
                outputBuffer = ensureBufferCapacity(outputBuffer, outputIndex, 1);
                outputBuffer[outputIndex++] = c;
            } else {
                i = inputBuffer[pos++];
                j = inputBuffer[pos++];
                i |= ((j & 0xF0) << 4);
                j = (j & 0x0F) + THRESHOLD;
                for (k = 0; k <= j; k++) {
                    c = text_buf[(i + k) & (N - 1)];
                    text_buf[r++] = c;
                    r &= (N - 1);
                    outputBuffer = ensureBufferCapacity(outputBuffer, outputIndex, 1);
                    outputBuffer[outputIndex++] = c;
                }
            }
        }
        return outputBuffer.slice(0, outputIndex);
    };

    return {
        unpack: lzssUnpack
    }
}

const saf4Loader = (convertToRGBA = true) => {

    const sharp = require('sharp');

    const unpackFile = saf4lzss().unpack


    const convertColor = (color) => ({
        red: Math.round(color.red * 255 / 31),
        green: Math.round(color.green * 255 / 31),
        blue: Math.round(color.blue * 255 / 31)
    });

    function extractRGB15(color) {
        const redMask = 0x7C00; // Binary: 111110000000000
        const greenMask = 0x03E0; // Binary: 000001111100000
        const blueMask = 0x001F; // Binary: 000000000011111

        const red = (color & redMask) >> 10; // Extract and shift red bits
        const green = (color & greenMask) >> 5; // Extract and shift green bits
        const blue = color & blueMask; // Extract blue bits (no need to shift)

        return { red: red * 255 / 31, green: green * 255 / 31, blue: blue * 255 / 31 };
    }


    function extractRgbData(width, height, buffer, offset, PcxPal) {
        let ArCur = 0;
        const rgbBuffer = Buffer.alloc(width * height * 3);
        let imageOffset = 0;

        while (ArCur < width * height) {
            const Byt = readByte(buffer, offset++);
            if ((Byt & 0xC0) === 0xC0) {
                const count = Byt & 0x3F;
                const Byt2 = readByte(buffer, offset++);
                for (let i = 0; i < count; i++) {
                    const color = convertColor(PcxPal[Byt2]);
                    rgbBuffer[imageOffset++] = color.red;
                    rgbBuffer[imageOffset++] = color.green;
                    rgbBuffer[imageOffset++] = color.blue;
                }
                ArCur += count;
            } else {
                const color = convertColor(PcxPal[Byt]);
                rgbBuffer[imageOffset++] = color.red;
                rgbBuffer[imageOffset++] = color.green;
                rgbBuffer[imageOffset++] = color.blue;
                ArCur++;
            }
        }
        return { rgbBuffer, offset };
    }

    const createRgbaBufferFromRgb = (rgbBuffer, width, height) => {
        const rgbaBuffer = Buffer.alloc(width * height * 4); // 4 bytes per pixel (R, G, B, A)

        for (let i = 0; i < width * height; i++) {
            const r = rgbBuffer[i * 3 + 0];
            const g = rgbBuffer[i * 3 + 1];
            const b = rgbBuffer[i * 3 + 2];
            const alpha = (r === 0 && g === 0 && b === 0) ? 0 : 255; // Set alpha to 0 if black, else 255

            rgbaBuffer[i * 4 + 0] = r;
            rgbaBuffer[i * 4 + 1] = g;
            rgbaBuffer[i * 4 + 2] = b;
            rgbaBuffer[i * 4 + 3] = alpha; // Alpha channel
        }

        return rgbaBuffer;
    };

    const loadSAF4Image = (fileName) => {
        let buffer = unpackFile(fs.readFileSync(fileName));
        let offset = 0;
        const PcxPal = new Array(256).fill().map((_, i) => {
            const red = readByte(buffer, offset) / 8;
            const green = readByte(buffer, offset + 1) / 8;
            const blue = readByte(buffer, offset + 2) / 8;
            offset += 3;
            return { red, green, blue };
        });

        const width = readWord(buffer, offset);
        offset += 2;
        const height = readWord(buffer, offset);
        offset += 2;

        console.log(fileName, width, height);

        let rgbBuffer;
        ({ rgbBuffer, offset } = extractRgbData(width, height, buffer, offset, PcxPal));

        return {
            width,
            height,
            palette: PcxPal,
            rgbBuffer
        };
    };

    const loadSAFBackground = (fileName) => {

        function compressArray(arr) {
            const compressed = [];
            let i = 0;

            while (i < arr.length) {
                let count = 1;
                while (((i + count) < arr.length) && (arr[i] === arr[i + count])) {
                    count++;
                }

                if (count > 1) {
                    compressed.push(arr[i] + 1000 * count);
                    i += count;
                } else {
                    compressed.push(arr[i]);
                    i++;
                }
            }

            return compressed;
        }


        let buffer = unpackFile(fs.readFileSync(fileName));
        let offset = 0;

        const width = readWord(buffer, offset);
        offset += 2;
        const height = readWord(buffer, offset);
        offset += 2;

        console.log(fileName, width, height);

        let ArCur = 0;
        const dataBuffer = Buffer.alloc(width * height);
        let imageOffset = 0;

        while (ArCur < width * height) {
            const Byt = readByte(buffer, offset++);
            if ((Byt & 0xC0) === 0xC0) {
                const count = Byt & 0x3F;
                const Byt2 = readByte(buffer, offset++);
                for (let i = 0; i < count; i++)
                    dataBuffer[imageOffset++] = Byt2;
                ArCur += count;
            } else {
                dataBuffer[imageOffset++] = Byt;
                ArCur++;
            }
        }


        return {
            width,
            height,
            data: compressArray(Array.from(dataBuffer))
        };
    };

    const loadSAF4Animation = (fileName /*, image, animIdx = -1*/) => {
        let buffer = unpackFile(fs.readFileSync(fileName));
        let offset = 0;
        let type = buffer.slice(0, 32).toString('ascii').trim();
        offset += 33;

        let animation = {
            type: type,
            id: readDWord(buffer, offset),
            frameCount: readWord(buffer, offset + 4),
            loopCount: readWord(buffer, offset + 6),
            //position: [],
            frames: []
        };

        console.log(fileName, animation);

        offset += 8;

        let maxRight = Number.NEGATIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;
        let minLeft = Number.POSITIVE_INFINITY;
        let minTop = Number.POSITIVE_INFINITY;

        // First pass to calculate bounding box
        for (let i = 0; i < animation.frameCount; i++) {
            let width = readWord(buffer, offset);
            let height = readWord(buffer, offset + 2);
            let posX = readWord(buffer, offset + 4);
            let posY = readWord(buffer, offset + 6);

            if (posX < minLeft) minLeft = posX;
            if (posY < minTop) minTop = posY;
            if (posX + width > maxRight) maxRight = posX + width;
            if (posY + height > maxBottom) maxBottom = posY + height;

            offset += 10 + width * height * 2; // Skip to the next frame
        }

        let totalWidth = maxRight - minLeft;
        let totalHeight = maxBottom - minTop;

        animation.width = totalWidth;
        animation.height = totalHeight;
        animation.offsetX = minLeft;
        animation.offsetY = minTop;
        let frameOffsets = [];

        console.log(`Max Right: ${maxRight}, Max Bottom: ${maxBottom}`);
        console.log(`Min Left: ${minLeft}, Min Top: ${minTop}`);
        console.log(`Canvas Width: ${totalWidth}, Canvas Height: ${totalHeight}`);

        // Reset offset to start parsing frames again
        offset = 41;

        for (let i = 0; i < animation.frameCount; i++) {
            let frame = {
                width: readWord(buffer, offset),
                height: readWord(buffer, offset + 2),
                posX: readWord(buffer, offset + 4),
                posY: readWord(buffer, offset + 6),
                speed: readWord(buffer, offset + 8),
                rgbBuffer: Buffer.alloc(totalWidth * totalHeight * 3, 0) // Pre-fill with black color
            };

            //animation.position.push({ x: frame.posX, y: frame.posY, w: frame.width, h: frame.height });

            let frameOffset = [frame.posX - minLeft, frame.posY - minTop]
            frameOffsets.push(frameOffset)
            console.log("Width, Height,", frame.width, frame.height, "Position X, Y", frame.posX, frame.posY, frame.speed, frameOffset);

            offset += 10; // Move to the pixel data

            for (let y = 0; y < frame.height; y++) {
                for (let x = 0; x < frame.width; x++) {
                    let color = extractRGB15(readWord(buffer, offset));
                    let targetX = frame.posX - minLeft + x;
                    let targetY = frame.posY - minTop + y;
                    let targetIndex = (targetY * totalWidth + targetX) * 3;

                    frame.rgbBuffer[targetIndex] = color.red;
                    frame.rgbBuffer[targetIndex + 1] = color.green;
                    frame.rgbBuffer[targetIndex + 2] = color.blue;

                    offset += 2;
                }
            }

            animation.frames.push(frame);
        }

        // Log differences in frame sizes and positions
        let hasOffsettedFrames = false;
        for (let i = 0; i < animation.frameCount; i++) {
            let frame = animation.frames[i];
            if (frame.width !== totalWidth || frame.height !== totalHeight || frame.posX !== minLeft || frame.posY !== minTop) {
                console.log(`Frame ${i} has different size or position: Width=${frame.width}, Height=${frame.height}, X=${frame.posX}, Y=${frame.posY}`);
                hasOffsettedFrames = true;
            }
        }

        if (hasOffsettedFrames) {
            animation.frameOffsets = frameOffsets
            console.log("Showing frame offserts", animation.frameOffsets)
        }

        return animation;
    };

    const savePNG = (image, outputPNG, convertToRGBA = true) => {
        sharp(
            (convertToRGBA) ? createRgbaBufferFromRgb(image.rgbBuffer, image.width, image.height) : image.rgbBuffer, {
            raw: {
                width: image.width,
                height: image.height,
                channels: convertToRGBA ? 4 : 3
            }
        })
            .toFormat('png')
            .toFile(outputPNG)
            .then(() => {
                console.log('PNG image saved.', outputPNG);
            })
            .catch(err => {
                console.error('Error converting to PNG:', err);
            });
    };

    function saveGIF(animation, outputFilePath) {

        const GIFEncoder = require('gifencoder');
        const { createCanvas } = require('canvas');

        console.log(`Creating gif ${animation.width}x${animation.height}`)
        const encoder = new GIFEncoder(animation.width, animation.height);
        const canvas = createCanvas(animation.width, animation.height);
        const ctx = canvas.getContext('2d');

        // Stream the GIF to a file
        const stream = encoder.createReadStream().pipe(fs.createWriteStream(outputFilePath));

        encoder.start();
        encoder.setRepeat(animation.loopCount != LOOP_FOREVER); // 0 for repeat, -1 for no-repeat
        console.log('Forever loop:', animation.loopCount == LOOP_FOREVER)
        encoder.setDelay(animation.speed); // Frame delay in ms
        encoder.setQuality(10); // Image quality (lower is better)
        encoder.setTransparent(0x00000000); // RGBA value for transparency

        animation.frames.forEach(frame => {
            console.log(`Adding frame to gif ${animation.width}x${animation.height}`)
            const imageData = ctx.createImageData(animation.width, animation.height);
            let rgbBuffer = (convertToRGBA) ? createRgbaBufferFromRgb(frame.rgbBuffer, animation.width, animation.height) : frame.rgbBuffer;;
            imageData.data.set(rgbBuffer);
            ctx.putImageData(imageData, 0, 0);
            encoder.addFrame(ctx);
        });

        encoder.finish();

        stream.on('finish', () => {
            console.log('GIF created successfully');
        });
    }

    return {
        loadSAF4Image,
        loadSAF4Animation,
        loadSAFBackground,
        savePNG,
        saveGIF
    }


}

const iniLoader = () => {

    const iconv = require('iconv-lite');

    function parseLevelIni(filePath) {
        const data = [];

        // Read the file content
        const fileContent = iconv.decode(fs.readFileSync(filePath), 'cp852');
        const lines = fileContent.split('\n');

        const parseAttributes = (parts) => {
            const attributes = {};
            for (let part of parts) {
                let [attrName, attrValue] = part.split('(');
                if (!attrValue) return;

                attrValue = attrValue.slice(0, -1); // Remove the trailing ')'
                attrName = attrName.toLowerCase();
                let attrKey = attrName;

                const attributeDetails = {};

                if (attrValue.includes(',')) {
                    const values = attrValue.split(',');

                    const addAttributes = (attrMap) => {
                        attrMap.forEach(([key, isString], index) => {
                            if (values[index]) attributeDetails[key] = isString ? values[index] : parseInt(values[index], 10);
                        });
                    };

                    switch (attrName) {
                        case 'entrance':
                            break;
                        case 'from':
                            addAttributes([
                                ['screen', true],
                                ['startX', false],
                                ['startY', false],
                                ['wTalkX', false],
                                ['wTalkY', false]
                            ]);
                            break;
                        case 'exit':
                        case 'exitif':
                        case 'exitnif':
                            attrKey = 'exit';

                            attributeDetails.exitIf = (attrName === 'exitif') ? parseInt(values.shift(), 10) : 0
                            attributeDetails.exitNIf = (attrName === 'exitnif') ? parseInt(values.shift(), 10) : 0

                            addAttributes([
                                ['exitTo', true],
                                ['exitX', false],
                                ['exitY', false],
                                ['exit', false],
                                ['exitAnim', false]
                            ]);
                            break;
                        case 'pick':
                        case 'pickif':
                            attrKey = 'pick';

                            attributeDetails.pickIf = (attrName === 'pickif') ? parseInt(values.shift(), 10) : 0
                            addAttributes([
                                ['pickWhat', false],
                                ['pickX', false],
                                ['pickY', false],
                                ['pickChange', false],
                                ['pickAnim', false]
                            ]);
                            break;
                        case 'talk':
                        case 'talkif':
                        case 'talkac':
                            attrKey = 'talk';

                            if (attrName === 'talkif') {
                                attributeDetails.talkIf = parseInt(values.shift(), 10);
                            } else if (attrName === 'talkac') {
                                attributeDetails.talkAC = parseInt(values.pop(), 10);
                            }
                            addAttributes([
                                ['talkTo', false],
                                ['talkX', false],
                                ['talkY', false],
                                ['wTalkX', false],
                                ['wTalkY', false],
                                ['talkChange', false],
                                ['talkAnim', false]
                            ]);
                            break;
                        case 'use':
                        case 'useif':
                            attrKey = 'use';

                            if (attrName === 'useif') {
                                attributeDetails.useIf = parseInt(values.shift(), 10);
                            }
                            addAttributes([
                                ['useWhat', false],
                                ['useX', false],
                                ['useY', false],
                                ['useChange', false],
                                ['useNotDrop', false],
                                ['useAnim', false]
                            ]);
                            break;
                        case 'look':
                        case 'lookif':
                            attrKey = 'look';
                            if (attrName === 'lookif') {
                                attributeDetails.lookIf = parseInt(values.shift(), 10);
                            }
                            addAttributes([
                                ['lookAt', false]
                            ]);
                            break;
                        case 'char':
                        case 'charif':
                            attrKey = 'char';
                            if (attrName === 'charif') {
                                attributeDetails.charIf = parseInt(values.shift(), 10);
                            }
                            // when, what, towhat
                            addAttributes([
                                ['chWhat', false],
                                ['chTo', false]
                            ]);
                            break;
                        case 'gameover':
                            addAttributes([
                                ['gameOver', false]
                            ]);
                            break;
                        case 'settimernp':
                            addAttributes([
                                ['timerNP', false],
                                ['timerWhat', false],
                                ['timerTo', false],
                                ['timer', false]
                            ]);
                            break;
                        case 'settimer':
                            addAttributes([
                                ['timerWhat', false],
                                ['timerTo', false],
                                ['timer', false]
                            ]);
                            break;
                        case 'setacif':
                        case 'destacif':
                        case 'destacp':
                        case 'play':
                            addAttributes([
                                ['when', false],
                                ['what', false]
                            ]);
                            break;
                        case 'from':
                            addAttributes([
                                ['from', true],
                                ['x', false],
                                ['y', false]
                            ]);
                            break;
                        case 'back':
                            addAttributes([
                                ['left', false],
                                ['top', false],
                                ['right', false],
                                ['bottom', false]
                            ]);
                            break;
                        case 'text':
                            addAttributes([
                                ['text', true],
                                ['start', false],
                                ['stop', false]
                            ]);
                            break;
                        case 'entrance':
                            addAttributes([
                                ['entrance', false]
                            ]);
                            break;
                        default:
                            break;
                    }
                    attributes[attrKey] = attributeDetails

                } else if (!isNaN(attrValue)) {
                    attributes[attrKey] = parseInt(attrValue, 10);
                } else {
                    attributes[attrKey] = attrValue;
                }

            }
            return attributes;
        };

        // Process each line
        let idx = 0;
        for (let line of lines) {
            line = line.trim();
            if ((line === '(END)') || line.startsWith("--")) {
                break;
            }

            if (line.startsWith('COUNT') || line.startsWith('ENTRANCE') || (line.startsWith('#')) || (line == '')) {
                continue;
            }

            // Match any attribute with parentheses, including those with spaces
            const parts = line.match(/(?:\S+\([^)]+\))/g);
            const isNamedItem = line.startsWith("NAME");

            // Extract the key name from the first part
            const keyValue = isNamedItem ? parts.shift() : idx;
            const keyName = isNamedItem ? keyValue.match(/\(([^)]+)\)/)[1].replace('.HI7', '') : 'index';
            console.log(keyName, "::", parts)



            let attributes = parseAttributes(parts) || {};
            if (!attributes) {
                console.log("Missing attributes for", keyName)
                continue
            }
            attributes.name = keyName
            attributes.idx = ++idx;
            //console.log(attributes)
            data.push(attributes);
        }

        return data;
    }

    function parseLevelTexts(filePath) {
        // Read the file content with DOS Central European encoding
        const fileContent = iconv.decode(fs.readFileSync(filePath), 'cp852');
        const lines = fileContent.split('\n');

        const data = [];
        let currentId = null;
        let currentTextArray = [];

        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('##')) return;

            if (line.startsWith('#')) {
                if ((currentId !== null) && (currentTextArray.length > 0)) {
                    // Save the previous block
                    data.push({ texts: currentTextArray, idx: currentId });
                }

                // Start a new block
                const parts = line.split(':');
                currentId = parseInt(parts[0].substring(1), 10);
                currentTextArray = [];
            } else if (line === '~') {
                currentTextArray.push('');
            } else {
                if (currentTextArray.length > 0 && currentTextArray[currentTextArray.length - 1] === '') {
                    currentTextArray[currentTextArray.length - 1] = line;
                } else {
                    currentTextArray.push(line);
                }
            }
        });

        // Push the last block if exists
        if ((currentId !== null) && (currentTextArray.length > 0)) {
            data.push({ texts: currentTextArray, idx: currentId });
        }

        return data;
    }

    return {
        parseLevelTexts,
        parseLevelIni
    }

}


//module.exports = 

async function convertAllFiles(directoryPath) {
    const searchPattern = path.join(directoryPath, '**', '*.+(INI)');
    //const searchPattern = path.join(directoryPath, '**', '*.+(INI|TXT)');
    //const searchPattern = path.join(directoryPath, '**', '*.+(HI7|IM7|INI|TXT|ARS)');
    console.log("Searching for", searchPattern)

    const ini = iniLoader()
    const saf4 = saf4Loader()


    let files = await glob(searchPattern, { nodir: true })
    console.log('Files found:', files.length);

    let details = JSON.parse(fs.readFileSync("data/anim.json"));

    if (files.length === 0) {
        console.log("No files found.");
        return;
    }

    files.forEach(file => {
        const extension = path.extname(file).toUpperCase();
        const relativePath = path.relative(directoryPath, file);
        const baseName = path.basename(file, extension);
        const outputDir = path.join('data', path.dirname(relativePath));
        const outputFile = path.join(outputDir, baseName + (extension === '.HI7' ? '.gif' : '.png'));
        let relativePathNew = path.relative('data', outputFile);

        // Ensure the directory exists or create it
        fs.ensureDirSync(outputDir)

        if (extension === '.IM7') {
            const img = saf4.loadSAF4Image(file);
            saf4.savePNG(img, outputFile);
            console.log(`Processed and saved IM7 as PNG: ${outputFile}`);
        } else if (extension === '.HI7') {
            const anim = saf4.loadSAF4Animation(file);
            saf4.saveGIF(anim, outputFile);
            delete anim.frames
            
            details[relativePathNew] = _.cloneDeep(anim)
            console.log(`Processed and saved HI7 as GIF: ${outputFile}`);
        } else if (file.includes("LEVEL.INI") || file.includes("HERO.INI") || file.includes("BKG_ARS.TXT") || file.includes("SCREEN.INI") || file.includes("ACTION.INI")|| file.includes("FORE.INI")) {
            if (file.includes("SCREEN.INI")) relativePathNew = relativePathNew + "_INI";
            console.log(`Processing Level INI file: ${file}`);
            details[relativePathNew.replace('.png', '')] = ini.parseLevelIni(file)

        } else if ((extension == ".ARS") || (extension == ".PTS")) {
            console.log(`Processing Level ARS file: ${file}`);
            if (file.includes("BKG.PTS")) relativePathNew = relativePathNew + "_PATH";
            details[relativePathNew.replace('.png', '')] = saf4.loadSAFBackground(file)
        } else if (extension == ".TXT") {
            console.log(`Processing Level TXT file: ${file}`);
            details[relativePathNew.replace('.png', '')] = ini.parseLevelTexts(file)

        }

    });

    console.log("Storing details");

    fs.writeFileSync("data/anim.json", JSON.stringify(details, null, 2), "utf-8")


}

let test = false;

if (!test)
    (async function main() {
        const directoryPath = path.resolve('../_original/RTMCODE/DATA/');
        //const directoryPath = path.resolve('../_original/RTMCODE/DATA/HERO/');
        console.log(`Absolute directory path: ${directoryPath}`);
        convertAllFiles(directoryPath);
    })()

else {
    //let image = saf4.loadSAF4Image("BKG.IM7");
    //saf4.savePNG(image, 'output.png', false);

    const saf4 = saf4Loader()


    let anim = saf4.loadSAF4Animation('../_original/RTMCODE/DATA/HERO/RIGHT.HI7');
    let anim2 = saf4.loadSAF4Animation('../_original/RTMCODE/DATA/HERO/LEFT.HI7');
    //_.each(anim.frames, (frame) => console.log(frame.posX, frame.posY))
    //console.log(JSON.stringify(anim, null, 4))

}