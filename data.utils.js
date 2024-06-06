function load_animation(fileName) {
    // original binary level data structure
    let levelsData = []

    const levelLen = 12 + 8 * 4 + 1 + 10 + 400;
    const fs = require('fs'),
        binary = fs.readFileSync(fileName);


}


load_animation('../_original/TRMCODE/DATA/SCREENS/PREDHOSP/BKF.IM7');