const fs = require("fs")
const data = require('./data.json');
const xlsx = require('xlsx');

let geoCodeData = {}
let ageData = {}
let houseData = {}

let geoCodeFile = xlsx.readFile("IndiaDistrictsGeoCode.xlsx");
let latitude;
let longitude;
for (const [k, v] of Object.entries(geoCodeFile.Sheets[geoCodeFile.SheetNames[0]])) {
    if (k.startsWith("D")) {
        latitude = v.v;
    } else if (k.startsWith("E")) {
        longitude = v.v;
    } else if (k.startsWith("F")) {
        geoCodeData[v.v] = [latitude, longitude];
    }
}


for (file of fs.readdirSync("age")) {
    let ageFile = xlsx.readFile(`age/${file}`)

    let stateName;
    let districtName;
    let ageRange;
    let stateId;
    let districtId;

    for (const [k, v] of Object.entries(ageFile.Sheets[ageFile.SheetNames[0]])) {
        if (parseInt(k.substring(1)) >= 7) {
            if (k.startsWith("B")) {
                stateId = v.v;
            } else if (k.startsWith("C")) {
                districtId = v.v;
            } else if (k.startsWith("D")) {
                if (v.v.startsWith("State - ")) {
                    stateName = v.v.split("State - ")[1].split("(")[0].trim().replace(/ +/g, "_").toLowerCase().replace("&", "and");
                } else if (v.v.startsWith("District - ")) {
                    districtName = v.v.split("District - ")[1].split("(")[0].trim().replace(/ +/g, "_").toLowerCase().replace("&", "and");
                } else {
                    districtName = undefined;
                }
            } else if (k.startsWith("E")) {
                ageRange = v.v;
            } else if (k.startsWith("F") && ageRange != "All ages" && ageRange != "Age not stated" && districtName != undefined) {
                let stateData = ageData[stateName] || { stateId: parseInt(stateId) }
                let districtData = stateData[districtName] || { districtId: parseInt(districtId) }
                districtData[ageRange] = v.v;

                stateData[districtName] = districtData;
                ageData[stateName] = stateData;
            }
        }
    }
}

for (file of fs.readdirSync("house")) {
    let houseFile = xlsx.readFile(`house/${file}`)

    let stateName;
    let districtName;
    let type;
    let stateId;
    let districtId;

    for (const [k, v] of Object.entries(houseFile.Sheets[houseFile.SheetNames[0]])) {
        if (parseInt(k.substring(1)) >= 7) {
            if (k.startsWith("B")) {
                stateId = v.v;
            } else if (k.startsWith("C")) {
                districtId = v.v;
            } else if (k.startsWith("F")) {
                if (v.v.startsWith("State - ")) {
                    stateName = v.v.split("State - ")[1].split("(")[0].trim().replace(/ +/g, "_").toLowerCase().replace("&", "and");
                } else if (v.v.startsWith("District - ")) {
                    districtName = v.v.split("District - ")[1].split("(")[0].trim().replace(/ +/g, "_").toLowerCase().replace("&", "and");
                } else {
                    districtName = undefined;
                }
            } else if (k.startsWith("G")) {
                type = v.v;
            } else if (type == "Total" && districtName != undefined) {
                let idx = "JKLMNNOPQR".indexOf(k.charAt(0));
                if (idx >= 0) {
                    let stateData = houseData[stateName] || { stateId: parseInt(stateId) }
                    let districtData = stateData[districtName] || { districtId: parseInt(districtId) }
                    districtData[idx] = v.v;

                    stateData[districtName] = districtData;
                    houseData[stateName] = stateData;
                }
            }
        }
    }
}

let personCsv = fs.readFileSync(`person.csv`, { encoding: 'UTF-8' }).split(/\r\n|\n/);
for (let row in personCsv) { personCsv[row] = personCsv[row].split(','); }
personCsvRowNames = personCsv.splice(0, 1)[0];

for (const [kStateHouse, vStateHouse] of Object.entries(houseData)) {
    let [_kStateAge, vStateAge] = Object.entries(ageData).filter(([_, vAge]) => vAge.stateId == vStateHouse.stateId)[0];

    for (const [kDistHouse, vDistHouse] of Object.entries(vStateHouse)) {
        if (kDistHouse == "stateId") {
            continue;
        }

        let state = kStateHouse;
        let district = kDistHouse;
        let distId = vDistHouse.districtId;

        let [_kDistAge, vDistAge] = Object.entries(vStateAge).find(([_, vDistAge]) => vDistAge.districtId == distId);
        let [_kDistGeoJson, vDistGeoJson] = Object.entries(data.features).find(([_, vGeoJson]) => vGeoJson.properties.censuscode == distId);
        vDistGeoJson.properties.gid = distId;
        vDistGeoJson.properties.name = district;
        vDistGeoJson = {
            "type": "FeatureCollection",
            "features": [vDistGeoJson]
        };
        let found;
        for (ele of personCsv) {
            if (distId == ele[personIdx("District code")]) {
                found = ele;
            }
        }

        fs.mkdirSync(`./generated/${state}/${district}`, { recursive: true });

        // admin_units.geojson
        fs.writeFileSync(`./generated/${state}/${district}/admin_units.geojson`, JSON.stringify(vDistGeoJson));

        // admin_unit_wise_pop.csv
        let popCsvStr = "Name,Latitude,Longitude,TOT_P\n";
        popCsvStr += district + ","
        popCsvStr += geoCodeData[distId][0] + ","
        popCsvStr += geoCodeData[distId][1] + ","
        popCsvStr += found[personIdx("Population")]
        fs.writeFileSync(`./generated/${state}/${district}/admin_unit_wise_pop.csv`, popCsvStr);

        // household_marg.csv
        let houseCsvStr = "district,distid,sample_geog,hhsize,hhsize,hhsize,hhsize,hhsize,hhsize,hhsize,hhsize,hhsize\n,,,hhsize_1,hhsize_2,hhsize_3,hhsize_4,hhsize_5,hhsize_6,hhsize_710,hhsize_1114,hhsize_15p\n";
        houseCsvStr += district + ","
        houseCsvStr += distId + ","
        houseCsvStr += "1,"
        for (const [kHouseRange, vHouseRange] of Object.entries(vDistHouse)) {
            if (kHouseRange != "districtId") {
                houseCsvStr += vHouseRange + ",";
            }
        }
        houseCsvStr = houseCsvStr.endsWith(",") ? houseCsvStr.substring(houseCsvStr, houseCsvStr.length - 1) : houseCsvStr;
        fs.writeFileSync(`./generated/${state}/${district}/household_marg.csv`, houseCsvStr);

        // person_marg.csv
        let personCsvStr = "district,distid,total_pop,SexLabel,SexLabel,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,Age,religion,religion,religion,religion,religion,religion,religion,caste,caste,caste\n,distid,total_pop,male,female,0to4,5to9,10to14,15to19,20to24,25to29,30to34,35to39,40to44,45to49,50to54,55to59,60to64,65to69,70to74,75to79,80p,hindu,muslim,christian,sikh,buddhist,jain,other,SC,ST,other\n";
        personCsvStr += district + ","
        personCsvStr += distId + ","
        personCsvStr += found[personIdx("Population")] + ","
        personCsvStr += found[personIdx("Male")] + ","
        personCsvStr += found[personIdx("Female")] + ","
        for (const [kAgeRange, vAgeRange] of Object.entries(vDistAge)) {
            if (kAgeRange != "districtId") {
                personCsvStr += vAgeRange + ",";
            }
        }
        personCsvStr += found[personIdx("Hindus")] + ","
        personCsvStr += found[personIdx("Muslims")] + ","
        personCsvStr += found[personIdx("Christians")] + ","
        personCsvStr += found[personIdx("Sikhs")] + ","
        personCsvStr += found[personIdx("Buddhists")] + ","
        personCsvStr += found[personIdx("Jains")] + ","
        personCsvStr += found[personIdx("Others_Religions")] + ","
        personCsvStr += found[personIdx("SC")] + ","
        personCsvStr += found[personIdx("ST")] + ","
        personCsvStr += (BigInt(found[personIdx("Population")]) - BigInt(found[personIdx("SC")]) - BigInt(found[personIdx("ST")]))
        fs.writeFileSync(`./generated/${state}/${district}/person_marg.csv`, personCsvStr);
    }
}

function personIdx(col) {
    return personCsvRowNames.indexOf(col);
}

/*
-- Sources --
Household: https://web.archive.org/web/20220312050023/https://www.censusindia.gov.in/2011census/population_enumeration.html
GeoJson: http://projects.datameet.org/maps/districts/
Ages: https://web.archive.org/web/20191114033245/http://www.censusindia.gov.in/2011census/C-series/C-14.html
Persons: https://www.kaggle.com/datasets/danofer/india-census
GeoCode: https://docs.google.com/spreadsheets/d/1ZKOVnRY3jSi-08vF73HnVcqS5jCXay1TRclSjUG0kKg/edit?usp=sharing
*/