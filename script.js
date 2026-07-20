"use strict";

mapboxgl.accessToken =
    "pk.eyJ1IjoiYXZlcnllam9obnMiLCJhIjoiY21uNmo3YnNiMDZrYTJwcTFwcHRzOG83NCJ9.aFx3CE9PzNOHSiDO7cEf2g";

const CASE_DATA_PATH =
    "data/01_master_case_files/01_cases_master_cleaned_FIXED.csv";

const HIGHWAY_DATA_PATH =
    "data/02_geographic_boundary_files/02_interstate_highways.geojson";


function initializeMap() {
    if (!mapboxgl.accessToken) {
        mapLoading.textContent =
            "ADD MAPBOX PUBLIC ACCESS TOKEN";

        searchStatus.textContent =
            "The map requires a Mapbox public access token.";

        return;
    }

    map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-77.0369, 38.9072],
        zoom: 10.15,
        minZoom: 8,
        maxZoom: 18,
        pitch: 0,
        bearing: 0
    });

    map.addControl(
        new mapboxgl.NavigationControl({
            showCompass: false
        }),
        "top-right"
    );

    map.on("load", () => {
        addHighwayLayer();
        loadCaseData();
    });

    map.on("error", (event) => {
        console.error("Mapbox error:", event.error);
    });
}

/* =========================================
   PAGE ELEMENTS
========================================= */

const searchInput = document.getElementById("case-search");
const searchButton = document.getElementById("search-button");
const caseTypeFilter = document.getElementById("case-type-filter");
const yearFilter = document.getElementById("year-filter");
const searchStatus = document.getElementById("search-status");
const mapLoading = document.getElementById("map-loading");


/* =========================================
   APPLICATION STATE
========================================= */

let map;
let allCases = [];
let caseGeoJSON = {
    type: "FeatureCollection",
    features: []
};


/* =========================================
   HELPERS
========================================= */

function cleanValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}


function escapeHTML(value) {
    return cleanValue(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function normalizeValue(value) {
    return cleanValue(value).toLowerCase();
}


function createCaseGeoJSON(rows) {
    const features = rows
        .map((row) => {
            const longitude = Number.parseFloat(row.longitude);
            const latitude = Number.parseFloat(row.latitude);

            if (
                !Number.isFinite(longitude) ||
                !Number.isFinite(latitude)
            ) {
                return null;
            }

            return {
                type: "Feature",

                geometry: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                },

                properties: {
                    case_id: cleanValue(row.case_id),
                    display_name: cleanValue(row.display_name),
                    case_type: cleanValue(row.case_type),
                    case_status: cleanValue(row.case_status),
                    outcome: cleanValue(row.outcome),
                    year_last_seen: cleanValue(row.year_last_seen),
                    age_at_event: cleanValue(row.age_at_event),
                    geocoded_address: cleanValue(row.geocoded_address),
                    case_summary: cleanValue(row.case_summary),
                    source_link: cleanValue(row.source_link)
                }
            };
        })
        .filter(Boolean);

    return {
        type: "FeatureCollection",
        features
    };
}


function populateFilters(rows) {
    const caseTypes = [
        ...new Set(
            rows
                .map((row) => cleanValue(row.case_type))
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

    const years = [
        ...new Set(
            rows
                .map((row) => cleanValue(row.year_last_seen))
                .filter(Boolean)
        )
    ].sort((a, b) => Number(b) - Number(a));


    caseTypes.forEach((caseType) => {
        const option = document.createElement("option");

        option.value = caseType;
        option.textContent = caseType;

        caseTypeFilter.appendChild(option);
    });


    years.forEach((year) => {
        const option = document.createElement("option");

        option.value = year;
        option.textContent = year;

        yearFilter.appendChild(option);
    });
}


function getFilteredCases() {
    const searchTerm = normalizeValue(searchInput.value);
    const selectedType = normalizeValue(caseTypeFilter.value);
    const selectedYear = cleanValue(yearFilter.value);

    return allCases.filter((row) => {
        const searchableText = [
            row.case_id,
            row.display_name,
            row.case_type,
            row.case_status,
            row.outcome,
            row.year_last_seen,
            row.geocoded_address,
            row.case_summary
        ]
            .map(normalizeValue)
            .join(" ");

        const matchesSearch =
            !searchTerm || searchableText.includes(searchTerm);

        const matchesType =
            !selectedType ||
            normalizeValue(row.case_type) === selectedType;

        const matchesYear =
            !selectedYear ||
            cleanValue(row.year_last_seen) === selectedYear;

        return matchesSearch && matchesType && matchesYear;
    });
}


function updateMapCases(rows) {
    caseGeoJSON = createCaseGeoJSON(rows);

    const source = map.getSource("case-points");

    if (source) {
        source.setData(caseGeoJSON);
    }

    const count = caseGeoJSON.features.length;

    searchStatus.textContent =
        `${count} documented ${count === 1 ? "case" : "cases"} shown.`;
}


function applyFilters() {
    const filteredCases = getFilteredCases();

    updateMapCases(filteredCases);
}

/* ===========================
   CASE POPUP
=========================== */

.mapboxgl-popup-content{
    padding:22px;
    border-radius:0;
    border:1px solid #1a1a1a;
    background:#ffffff;
    box-shadow:none;
}

.mapboxgl-popup-close-button{
    font-size:20px;
    color:#555;
    padding:6px 10px;
}

.case-popup{
    font-family:Georgia, serif;
    color:#111;
    width:320px;
}

.case-popup h2{
    margin:0;
    font-size:24px;
    line-height:1.2;
    font-weight:700;
}

.popup-divider{
    margin:14px 0 18px;
    border-top:1px solid #d8d8d8;
}

.popup-field{
    margin-bottom:16px;
}

.popup-label{
    display:block;
    font-size:10px;
    letter-spacing:.18em;
    color:#777;
    margin-bottom:4px;
    font-family:Arial, sans-serif;
}

.popup-value{
    display:block;
    font-size:15px;
    line-height:1.55;
}

.popup-link{
    display:inline-block;
    margin-top:10px;
    color:#7f0000;
    text-decoration:none;
    font-weight:bold;
    letter-spacing:.08em;
    text-transform:uppercase;
    font-size:11px;
}

.popup-link:hover{
    text-decoration:underline;
};

    return `
        <div class="case-popup">

            <h2>${value(properties.display_name)}</h2>

            <div class="popup-divider"></div>

            <div class="popup-field">
                <span class="popup-label">CASE TYPE</span>
                <span class="popup-value">${value(properties.case_type)}</span>
            </div>

            <div class="popup-field">
                <span class="popup-label">STATUS</span>
                <span class="popup-value">${value(properties.case_status)}</span>
            </div>

            <div class="popup-field">
                <span class="popup-label">LAST KNOWN LOCATION</span>
                <span class="popup-value">
                    ${value(properties.geocoded_address)}
                </span>
            </div>

            <div class="popup-field">
                <span class="popup-label">LAST SEEN</span>
                <span class="popup-value">
                    ${value(properties.date_last_seen)}
                </span>
            </div>

            <div class="popup-field">
                <span class="popup-label">AGE</span>
                <span class="popup-value">
                    ${value(properties.age_at_event)}
                </span>
            </div>

            <div class="popup-field">
                <span class="popup-label">CASE SUMMARY</span>
                <span class="popup-value">
                    ${value(properties.case_summary)}
                </span>
            </div>

            ${
                properties.source_link
                    ? `
                    <a
                        class="popup-link"
                        href="${properties.source_link}"
                        target="_blank"
                    >
                        VIEW SOURCE →
                    </a>
                    `
                    : ""
            }

        </div>
    `;
}

/* =========================================
   LOAD CASE CSV
========================================= */

function loadCaseData() {
    Papa.parse(CASE_DATA_PATH, {
        download: true,
        header: true,
        skipEmptyLines: true,

        complete(results) {
            if (results.errors.length > 0) {
                console.warn(
                    "CSV parsing warnings:",
                    results.errors
                );
            }

            allCases = results.data.filter((row) => {
                return (
                    cleanValue(row.latitude) &&
                    cleanValue(row.longitude)
                );
            });

            caseGeoJSON = createCaseGeoJSON(allCases);

            populateFilters(allCases);
            addCaseLayer();

            searchStatus.textContent =
                `${caseGeoJSON.features.length} documented cases shown.`;

            mapLoading.hidden = true;
        },

        error(error) {
            console.error("Unable to load case CSV:", error);

            searchStatus.textContent =
                "The case data could not be loaded.";

            mapLoading.textContent =
                "CASE DATA COULD NOT BE LOADED";
        }
    });
}

/* =========================================
   MAP LAYERS
========================================= */

function addHighwayLayer() {
    map.addSource("interstate-highways", {
        type: "geojson",
        data: HIGHWAY_DATA_PATH
    });

    map.addLayer({
        id: "interstate-highways-shadow",
        type: "line",
        source: "interstate-highways",

        paint: {
            "line-color": "#ffffff",
            "line-width": 5,
            "line-opacity": 0.8
        }
    });

    map.addLayer({
        id: "interstate-highways-line",
        type: "line",
        source: "interstate-highways",

        paint: {
            "line-color": "#467d42",
            "line-width": 2.4,
            "line-opacity": 0.9
        }
    });
}


function addCaseLayer() {
    map.addSource("case-points", {
        type: "geojson",
        data: caseGeoJSON,

        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 42
    });


    map.addLayer({
        id: "case-clusters",
        type: "circle",
        source: "case-points",
        filter: ["has", "point_count"],

        paint: {
            "circle-color": "#111111",
            "circle-radius": [
                "step",
                ["get", "point_count"],
                15,
                15,
                19,
                35,
                23
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5
        }
    });


    map.addLayer({
        id: "case-cluster-count",
        type: "symbol",
        source: "case-points",
        filter: ["has", "point_count"],

        layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 11
        },

        paint: {
            "text-color": "#ffffff"
        }
    });


    map.addLayer({
        id: "case-unclustered-points",
        type: "circle",
        source: "case-points",
        filter: ["!", ["has", "point_count"]],

        paint: {
            "circle-color": "#b81e2b",
            "circle-radius": 5,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.4,
            "circle-opacity": 0.92
        }
    });


    map.on("click", "case-clusters", (event) => {
        const features = map.queryRenderedFeatures(
            event.point,
            {
                layers: ["case-clusters"]
            }
        );

        if (!features.length) {
            return;
        }

        const clusterId =
            features[0].properties.cluster_id;

        map
            .getSource("case-points")
            .getClusterExpansionZoom(
                clusterId,
                (error, zoom) => {
                    if (error) {
                        console.error(error);
                        return;
                    }

                    map.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom
                    });
                }
            );
    });


    map.on("click", "case-unclustered-points", (event) => {
        const feature = event.features[0];

        const coordinates =
            feature.geometry.coordinates.slice();

        const popupHTML =
            createPopupHTML(feature.properties);

        new mapboxgl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: "310px"
        })
            .setLngLat(coordinates)
            .setHTML(popupHTML)
            .addTo(map);
    });


    const interactiveLayers = [
        "case-clusters",
        "case-unclustered-points"
    ];

    interactiveLayers.forEach((layerId) => {
        map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
        });
    });
}


/* =========================================
   SEARCH EVENTS
========================================= */
searchButton.addEventListener("click", applyFilters);

searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        applyFilters();
    }
});

searchInput.addEventListener("input", applyFilters);
caseTypeFilter.addEventListener("change", applyFilters);
yearFilter.addEventListener("change", applyFilters);

initializeMap();
