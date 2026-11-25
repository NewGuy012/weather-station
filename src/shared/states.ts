import type { StateMeta, USRegion } from './types';

type CityRow = readonly [name: string, lat: number, lon: number];
type StateRow = readonly [
  code: string,
  fips: string,
  name: string,
  region: USRegion,
  cities: readonly CityRow[],
  labelOffset?: readonly [number, number],
];

const STATE_ROWS: readonly StateRow[] = [
  ["AL", "01", "Alabama", "Southeast", [["Birmingham",33.52,-86.81],["Montgomery",32.38,-86.3],["Mobile",30.69,-88.04],["Huntsville",34.73,-86.59]]],
  ["AK", "02", "Alaska", "Pacific", [["Anchorage",61.22,-149.9],["Fairbanks",64.84,-147.72],["Juneau",58.3,-134.42],["Utqiagvik",71.29,-156.79]]],
  ["AZ", "04", "Arizona", "Southwest", [["Phoenix",33.45,-112.07],["Tucson",32.22,-110.97],["Flagstaff",35.2,-111.65],["Yuma",32.69,-114.63]]],
  ["AR", "05", "Arkansas", "Southeast", [["Little Rock",34.75,-92.29],["Fayetteville",36.08,-94.17],["Fort Smith",35.39,-94.4]]],
  ["CA", "06", "California", "West", [["Los Angeles",34.05,-118.24],["San Francisco",37.77,-122.42],["Sacramento",38.58,-121.49],["San Diego",32.72,-117.16]]],
  ["CO", "08", "Colorado", "West", [["Denver",39.74,-104.99],["Colorado Springs",38.83,-104.82],["Grand Junction",39.06,-108.55],["Aspen",39.19,-106.82]]],
  ["CT", "09", "Connecticut", "Northeast", [["Hartford",41.76,-72.67],["New Haven",41.31,-72.92],["Bridgeport",41.18,-73.19]], [22,16]],
  ["DE", "10", "Delaware", "Northeast", [["Wilmington",39.74,-75.55],["Dover",39.16,-75.52],["Rehoboth Beach",38.72,-75.08]], [34,8]],
  ["FL", "12", "Florida", "Southeast", [["Miami",25.76,-80.19],["Orlando",28.54,-81.38],["Tampa",27.95,-82.46],["Jacksonville",30.33,-81.66]]],
  ["GA", "13", "Georgia", "Southeast", [["Atlanta",33.75,-84.39],["Savannah",32.08,-81.09],["Augusta",33.47,-82.01]]],
  ["HI", "15", "Hawaii", "Pacific", [["Honolulu",21.31,-157.86],["Hilo",19.72,-155.09],["Kahului",20.89,-156.47],["Lihue",21.98,-159.37]]],
  ["ID", "16", "Idaho", "West", [["Boise",43.62,-116.2],["Idaho Falls",43.49,-112.03],["Coeur d'Alene",47.68,-116.78]]],
  ["IL", "17", "Illinois", "Midwest", [["Chicago",41.88,-87.63],["Springfield",39.78,-89.65],["Peoria",40.69,-89.59]]],
  ["IN", "18", "Indiana", "Midwest", [["Indianapolis",39.77,-86.16],["Fort Wayne",41.08,-85.14],["Evansville",37.97,-87.57]]],
  ["IA", "19", "Iowa", "Midwest", [["Des Moines",41.59,-93.62],["Cedar Rapids",41.98,-91.67],["Sioux City",42.5,-96.4]]],
  ["KS", "20", "Kansas", "Midwest", [["Wichita",37.69,-97.34],["Topeka",39.05,-95.68],["Dodge City",37.75,-100.02]]],
  ["KY", "21", "Kentucky", "Southeast", [["Louisville",38.25,-85.76],["Lexington",38.04,-84.5],["Bowling Green",36.97,-86.48]]],
  ["LA", "22", "Louisiana", "Southeast", [["New Orleans",29.95,-90.07],["Baton Rouge",30.45,-91.19],["Shreveport",32.53,-93.75]]],
  ["ME", "23", "Maine", "Northeast", [["Portland",43.66,-70.26],["Bangor",44.8,-68.77],["Caribou",46.86,-68.01]]],
  ["MD", "24", "Maryland", "Northeast", [["Baltimore",39.29,-76.61],["Annapolis",38.98,-76.49],["Ocean City",38.34,-75.08]], [26,24]],
  ["MA", "25", "Massachusetts", "Northeast", [["Boston",42.36,-71.06],["Worcester",42.26,-71.8],["Springfield",42.1,-72.59]], [34,-8]],
  ["MI", "26", "Michigan", "Midwest", [["Detroit",42.33,-83.05],["Grand Rapids",42.96,-85.67],["Marquette",46.54,-87.4]]],
  ["MN", "27", "Minnesota", "Midwest", [["Minneapolis",44.98,-93.27],["Duluth",46.79,-92.1],["Rochester",44.01,-92.48]]],
  ["MS", "28", "Mississippi", "Southeast", [["Jackson",32.3,-90.18],["Biloxi",30.4,-88.89],["Tupelo",34.26,-88.7]]],
  ["MO", "29", "Missouri", "Midwest", [["Kansas City",39.1,-94.58],["St. Louis",38.63,-90.2],["Springfield",37.21,-93.29]]],
  ["MT", "30", "Montana", "West", [["Billings",45.78,-108.5],["Missoula",46.87,-114],["Great Falls",47.5,-111.3]]],
  ["NE", "31", "Nebraska", "Midwest", [["Omaha",41.26,-95.93],["Lincoln",40.81,-96.7],["North Platte",41.12,-100.77]]],
  ["NV", "32", "Nevada", "West", [["Las Vegas",36.17,-115.14],["Reno",39.53,-119.81],["Elko",40.83,-115.76]]],
  ["NH", "33", "New Hampshire", "Northeast", [["Concord",43.21,-71.54],["Manchester",42.99,-71.46],["Mount Washington",44.27,-71.3]], [22,-24]],
  ["NJ", "34", "New Jersey", "Northeast", [["Newark",40.74,-74.17],["Trenton",40.22,-74.74],["Atlantic City",39.36,-74.42]], [26,2]],
  ["NM", "35", "New Mexico", "Southwest", [["Albuquerque",35.08,-106.65],["Santa Fe",35.69,-105.94],["Las Cruces",32.32,-106.76]]],
  ["NY", "36", "New York", "Northeast", [["New York",40.71,-74.01],["Buffalo",42.89,-78.88],["Albany",42.65,-73.76],["Syracuse",43.05,-76.15]]],
  ["NC", "37", "North Carolina", "Southeast", [["Charlotte",35.23,-80.84],["Raleigh",35.78,-78.64],["Asheville",35.6,-82.55],["Wilmington",34.21,-77.89]]],
  ["ND", "38", "North Dakota", "Midwest", [["Fargo",46.88,-96.79],["Bismarck",46.81,-100.78],["Minot",48.23,-101.3]]],
  ["OH", "39", "Ohio", "Midwest", [["Columbus",39.96,-83],["Cleveland",41.5,-81.69],["Cincinnati",39.1,-84.51]]],
  ["OK", "40", "Oklahoma", "Southwest", [["Oklahoma City",35.47,-97.52],["Tulsa",36.15,-95.99],["Lawton",34.6,-98.39]]],
  ["OR", "41", "Oregon", "West", [["Portland",45.52,-122.68],["Eugene",44.05,-123.09],["Bend",44.06,-121.32]]],
  ["PA", "42", "Pennsylvania", "Northeast", [["Philadelphia",39.95,-75.17],["Pittsburgh",40.44,-80],["Harrisburg",40.27,-76.89]]],
  ["RI", "44", "Rhode Island", "Northeast", [["Providence",41.82,-71.41],["Newport",41.49,-71.31]], [42,4]],
  ["SC", "45", "South Carolina", "Southeast", [["Charleston",32.78,-79.93],["Columbia",34,-81.03],["Greenville",34.85,-82.39]]],
  ["SD", "46", "South Dakota", "Midwest", [["Sioux Falls",43.55,-96.73],["Rapid City",44.08,-103.23],["Pierre",44.37,-100.35]]],
  ["TN", "47", "Tennessee", "Southeast", [["Nashville",36.16,-86.78],["Memphis",35.15,-90.05],["Knoxville",35.96,-83.92]]],
  ["TX", "48", "Texas", "Southwest", [["Austin",30.27,-97.74],["Houston",29.76,-95.37],["Dallas",32.78,-96.8],["El Paso",31.76,-106.49]]],
  ["UT", "49", "Utah", "West", [["Salt Lake City",40.76,-111.89],["St. George",37.1,-113.57],["Moab",38.57,-109.55]]],
  ["VT", "50", "Vermont", "Northeast", [["Burlington",44.48,-73.21],["Montpelier",44.26,-72.58],["Rutland",43.61,-72.97]], [-12,-26]],
  ["VA", "51", "Virginia", "Southeast", [["Richmond",37.54,-77.44],["Virginia Beach",36.85,-75.98],["Roanoke",37.27,-79.94]]],
  ["WA", "53", "Washington", "West", [["Seattle",47.61,-122.33],["Spokane",47.66,-117.43],["Yakima",46.6,-120.51]]],
  ["WV", "54", "West Virginia", "Southeast", [["Charleston",38.35,-81.63],["Morgantown",39.63,-79.96],["Huntington",38.42,-82.45]]],
  ["WI", "55", "Wisconsin", "Midwest", [["Milwaukee",43.04,-87.91],["Madison",43.07,-89.4],["Green Bay",44.51,-88.02]]],
  ["WY", "56", "Wyoming", "West", [["Cheyenne",41.14,-104.82],["Casper",42.87,-106.31],["Jackson",43.48,-110.76]]],
];

export const US_STATES: StateMeta[] = STATE_ROWS.map(
  ([code, fips, name, region, rawCities, labelOffset]) => {
    const cities = rawCities.map(([cName, lat, lon]) => ({ name: cName, lat, lon }));
    const primary = cities[0]!;
    return {
      code,
      fips,
      name,
      region,
      lat: primary.lat,
      lon: primary.lon,
      primaryCity: primary.name,
      cities,
      ...(labelOffset ? { labelOffset: [labelOffset[0], labelOffset[1]] as [number, number] } : {}),
    };
  },
);

export const STATE_BY_CODE: Record<string, StateMeta> = Object.fromEntries(
  US_STATES.map((s) => [s.code, s]),
);

export const STATE_BY_FIPS: Record<string, StateMeta> = Object.fromEntries(
  US_STATES.map((s) => [s.fips, s]),
);
