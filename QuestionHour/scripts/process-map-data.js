const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const turf = require('@turf/turf');

// Configuration
const YEAR = '2023';
const STATES = ['06']; // California for testing, we'll add more states later
const OUTPUT_DIR = path.join(__dirname, '../public/map-data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Function to download a file
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => reject(err));
    });
  });
}

// Function to process a state's ZIP codes
async function processState(stateCode) {
  const url = `https://www2.census.gov/geo/tiger/TIGER${YEAR}/ZCTA5/tl_${YEAR}_${stateCode}_zcta520.zip`;
  const zipPath = path.join(OUTPUT_DIR, `tl_${YEAR}_${stateCode}_zcta520.zip`);
  const shpPath = path.join(OUTPUT_DIR, `tl_${YEAR}_${stateCode}_zcta520.shp`);
  const geojsonPath = path.join(OUTPUT_DIR, `${stateCode}_zcta520.geojson`);

  console.log(`Processing state ${stateCode}...`);

  try {
    // Download the shapefile
    console.log('Downloading shapefile...');
    await downloadFile(url, zipPath);

    // Unzip the file
    console.log('Unzipping...');
    await new Promise((resolve, reject) => {
      exec(`powershell Expand-Archive -Path "${zipPath}" -DestinationPath "${OUTPUT_DIR}" -Force`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Convert to GeoJSON and simplify
    console.log('Converting to GeoJSON and simplifying...');
    await new Promise((resolve, reject) => {
      exec(`mapshaper "${shpPath}" -simplify 10% -o format=geojson "${geojsonPath}"`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Clean up temporary files
    console.log('Cleaning up...');
    fs.unlinkSync(zipPath);
    fs.unlinkSync(shpPath);

    console.log(`Completed processing state ${stateCode}`);
  } catch (error) {
    console.error(`Error processing state ${stateCode}:`, error);
  }
}

// Process all states
async function processAllStates() {
  for (const state of STATES) {
    await processState(state);
  }
}

// Run the script
processAllStates().then(() => {
  console.log('All states processed successfully');
}).catch(error => {
  console.error('Error processing states:', error);
}); 