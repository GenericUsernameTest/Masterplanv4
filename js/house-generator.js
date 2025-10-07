/**
 * House Generator Module
 * Generates houses along road centerlines with consistent spacing and offset
 */

class HouseGenerator {
  constructor() {
    this.houseTypes = [];
    this.roads = [];
    this.generatedHouses = [];
    this.edgeSpacing = 5; // meters edge-to-edge spacing
    this.roadOffset = 10; // meters offset from road centerline (increased to avoid road surface)
    
    // House colors by type
    this.typeColors = {
      1: '#ff4444', // red
      2: '#44ff44', // green
      3: '#4444ff'  // blue
    };
  }

  /**
   * Load house definitions from JSON files
   * @returns {Promise<Array>} Array of house type definitions
   */
  async loadHouseTypes() {
    const houseFiles = ['HouseType1.geojson', 'HouseType2.geojson', 'HouseType3.geojson'];
    this.houseTypes = [];

    for (let i = 0; i < houseFiles.length; i++) {
      const filename = houseFiles[i];
      try {
        console.log(`📦 Loading house type: ${filename}`);
        const response = await fetch(`components/houses/${filename}`);
        
        if (!response.ok) {
          // Try alternative path
          const altResponse = await fetch(`components/homes/${filename}`);
          if (!altResponse.ok) {
            throw new Error(`Failed to load ${filename}`);
          }
          var data = await altResponse.json();
        } else {
          var data = await response.json();
        }

        // Extract house data from GeoJSON
        const houseData = this.parseHouseGeoJSON(data, i + 1);
        this.houseTypes.push(houseData);
        
        console.log(`✅ Loaded house type ${i + 1}:`, houseData);
      } catch (error) {
        console.error(`❌ Failed to load ${filename}:`, error);
        // Create fallback house type
        this.houseTypes.push(this.createFallbackHouse(i + 1));
      }
    }

    return this.houseTypes;
  }

  /**
   * Parse GeoJSON to extract house geometry and dimensions
   * @param {Object} geojson - GeoJSON data
   * @param {number} typeId - House type ID
   * @returns {Object} House definition
   */
  parseHouseGeoJSON(geojson, typeId) {
    const features = geojson.features || [];
    if (features.length === 0) {
      return this.createFallbackHouse(typeId);
    }

    // Use the first feature as the house outline
    const houseFeature = features[0];
    let coordinates;
    
    if (houseFeature.geometry.type === 'LineString') {
      coordinates = houseFeature.geometry.coordinates;
      // Ensure the polygon is closed
      if (coordinates[0][0] !== coordinates[coordinates.length-1][0] || 
          coordinates[0][1] !== coordinates[coordinates.length-1][1]) {
        coordinates.push([...coordinates[0]]);
      }
    } else if (houseFeature.geometry.type === 'Polygon') {
      coordinates = houseFeature.geometry.coordinates[0]; // exterior ring
    } else {
      return this.createFallbackHouse(typeId);
    }

    // Calculate dimensions from geometry bounds (for spacing calculations)
    const bounds = this.calculateBounds(coordinates);
    const width = bounds.maxX - bounds.minX;
    const length = bounds.maxY - bounds.minY;

    // Normalize geometry to have origin at center bottom (front of house)
    const normalizedGeometry = this.normalizeHouseGeometry(coordinates, bounds);

    return {
      type: typeId,
      width: width,
      length: length,
      geometry: normalizedGeometry, // Use exact geometry, not simplified rectangle
      color: this.typeColors[typeId] || '#888888',
      bounds: bounds
    };
  }

  /**
   * Create a fallback house definition if JSON loading fails
   * @param {number} typeId - House type ID
   * @returns {Object} Fallback house definition
   */
  createFallbackHouse(typeId) {
    const widths = [8, 12, 6]; // meters
    const lengths = [10, 8, 14]; // meters
    
    const width = widths[typeId - 1] || 8;
    const length = lengths[typeId - 1] || 10;

    // Create simple rectangular geometry
    const geometry = [
      [0, 0],
      [width, 0],
      [width, length],
      [0, length],
      [0, 0]
    ];

    return {
      type: typeId,
      width: width,
      length: length,
      geometry: geometry,
      color: this.typeColors[typeId] || '#888888',
      bounds: { minX: 0, minY: 0, maxX: width, maxY: length }
    };
  }

  /**
   * Calculate bounding box from coordinates
   * @param {Array} coordinates - Array of [x, y] coordinate pairs
   * @returns {Object} Bounds object with min/max X/Y
   */
  calculateBounds(coordinates) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    coordinates.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    return { minX, minY, maxX, maxY };
  }

  /**
   * Normalize house geometry to have origin at center-bottom with precise measurements
   * @param {Array} coordinates - Original house coordinates
   * @param {Object} bounds - House bounds
   * @returns {Array} Normalized coordinates
   */
  normalizeHouseGeometry(coordinates, bounds) {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const frontY = bounds.minY; // Front of house at minimum Y
    
    // Normalize so the house center is at X=0 and front edge is at Y=0
    return coordinates.map(([x, y]) => [
      x - centerX, // Center horizontally at X=0
      y - frontY   // Front edge at Y=0
    ]);
  }  /**
   * Set road data from the map
   * @param {Array} roadFeatures - Array of road features from map
   */
  setRoads(roadFeatures) {
    this.roads = roadFeatures.filter(feature => 
      feature.geometry && feature.geometry.type === 'LineString'
    );
    // Store all road geometries for collision detection (includes placed blocks + generated roads)
    this.allRoadGeometries = [...roadFeatures].filter(feature => 
      feature.geometry && feature.geometry.type === 'LineString'
    );
    console.log(`🛣️ Loaded ${this.roads.length} road centerlines for house placement`);
    console.log(`🚫 Loaded ${this.allRoadGeometries.length} total road geometries for collision detection`);
  }

  /**
   * Generate houses along all roads
   * @returns {Array} Array of positioned house objects
   */
  async generateHouses() {
    console.log('🏠 Starting house generation...');
    
    // Load house types if not already loaded
    if (this.houseTypes.length === 0) {
      await this.loadHouseTypes();
    }

    this.generatedHouses = [];

    // Generate houses for each road
    this.roads.forEach((road, roadIndex) => {
      const roadHouses = this.generateHousesAlongRoad(road, roadIndex);
      this.generatedHouses.push(...roadHouses);
    });

    console.log(`🎉 Generated ${this.generatedHouses.length} houses along ${this.roads.length} roads`);
    return this.generatedHouses;
  }

  /**
   * Generate houses along a single road (both sides)
   * @param {Object} road - Road feature with LineString geometry
   * @param {number} roadIndex - Index of the road
   * @returns {Array} Array of house objects for this road
   */
  generateHousesAlongRoad(road, roadIndex) {
    const coordinates = road.geometry.coordinates;
    if (coordinates.length < 2) return [];

    const houses = [];
    const roadLength = this.calculateRoadLength(coordinates);
    
    // Generate houses for both sides of the road
    for (const side of ['left', 'right']) {
      const sideMultiplier = side === 'left' ? -1 : 1;
      
      // Calculate positions along the road with equal arc-length spacing
      const positions = this.calculateHousePositions(coordinates, roadLength, side);
      
      // Place houses at each position using the pre-determined house types
      positions.forEach((position, index) => {
        // Use the house type already determined in calculateHousePositions
        const houseType = position.houseType;
        
        // Create house object with position and orientation
        const house = this.createHouseAtPosition(position, houseType, roadIndex, `${side}_${position.index}`, sideMultiplier);
        
        // Check for road collision before adding to houses array (excluding the current road)
        const hasCollision = this.checkHouseRoadCollision(house, 6, roadIndex); // 6m buffer, exclude current road
        
        if (!hasCollision) {
          houses.push(house);
        } else {
          console.log(`🚫 Skipping house ${house.id} due to road collision`);
        }
      });
    }

    return houses;
  }

  /**
   * Calculate total length of a road polyline (handles geographic coordinates)
   * @param {Array} coordinates - Array of [lng, lat] coordinates
   * @returns {number} Total length in meters
   */
  calculateRoadLength(coordinates) {
    let totalLength = 0;
    
    for (let i = 1; i < coordinates.length; i++) {
      // Use turf.js for accurate geographic distance calculation
      const from = turf.point(coordinates[i-1]);
      const to = turf.point(coordinates[i]);
      const distance = turf.distance(from, to, { units: 'meters' });
      totalLength += distance;
    }
    
    return totalLength;
  }

  /**
   * Calculate house positions along road with mathematically precise spacing
   * @param {Array} coordinates - Road coordinates [lng, lat]
   * @param {number} roadLength - Total road length in meters
   * @param {string} side - Which side of road ('left' or 'right')
   * @returns {Array} Array of position objects with coordinates and orientation
   */
  calculateHousePositions(coordinates, roadLength, side) {
    const positions = [];
    
    // Calculate cumulative distances with high precision
    const cumulativeDistances = [0];
    
    for (let i = 1; i < coordinates.length; i++) {
      const from = turf.point(coordinates[i-1]);
      const to = turf.point(coordinates[i]);
      const segmentLength = turf.distance(from, to, { units: 'meters' });
      cumulativeDistances.push(cumulativeDistances[i-1] + segmentLength);
    }

    // Generate a random sequence of houses first to determine total space needed
    const houseSequence = [];
    const availableLength = roadLength - 10; // Leave 5m at each end
    let totalWidthNeeded = 0;
    let tempHouses = [];
    
    // Create houses until we run out of space
    while (true) {
      const houseTypeIndex = Math.floor(Math.random() * this.houseTypes.length);
      const houseType = this.houseTypes[houseTypeIndex];
      
      // Check if this house would fit
      const spaceNeeded = houseType.width + this.edgeSpacing;
      if (totalWidthNeeded + houseType.width > availableLength) {
        break; // Stop if house won't fit
      }
      
      tempHouses.push(houseType);
      totalWidthNeeded += spaceNeeded;
    }
    
    // Remove the last spacing since there's no house after the last one
    if (tempHouses.length > 0) {
      totalWidthNeeded -= this.edgeSpacing;
    }
    
    // Now place houses with exact spacing
    let currentDistance = 5; // Start exactly 5m from beginning
    
    tempHouses.forEach((houseType, index) => {
      const position = this.interpolatePositionAtDistance(coordinates, cumulativeDistances, currentDistance);
      
      if (position) {
        positions.push({
          ...position,
          side: side,
          distance: currentDistance,
          houseType: houseType,
          index: index
        });
      }
      
      // Move to next house position: current house width + exact spacing
      currentDistance += houseType.width + this.edgeSpacing;
    });

    return positions;
  }

  /**
   * Interpolate position and orientation at a specific distance along the road with high precision
   * @param {Array} coordinates - Road coordinates [lng, lat]
   * @param {Array} cumulativeDistances - Cumulative distances at each point in meters
   * @param {number} targetDistance - Distance along road to find position in meters
   * @returns {Object} Position with lng, lat, bearing
   */
  interpolatePositionAtDistance(coordinates, cumulativeDistances, targetDistance) {
    // Find the segment containing the target distance
    let segmentIndex = 0;
    for (let i = 1; i < cumulativeDistances.length; i++) {
      if (cumulativeDistances[i] >= targetDistance) {
        segmentIndex = i - 1;
        break;
      }
    }

    if (segmentIndex >= coordinates.length - 1) return null;

    // Calculate precise interpolation within the segment
    const segmentStart = cumulativeDistances[segmentIndex];
    const segmentEnd = cumulativeDistances[segmentIndex + 1];
    const segmentLength = segmentEnd - segmentStart;
    
    if (segmentLength === 0) {
      // Handle zero-length segments
      const point = turf.point(coordinates[segmentIndex]);
      const nextPoint = turf.point(coordinates[Math.min(segmentIndex + 1, coordinates.length - 1)]);
      const bearing = turf.bearing(point, nextPoint);
      
      return { 
        lng: coordinates[segmentIndex][0], 
        lat: coordinates[segmentIndex][1], 
        bearing: bearing,
        houseAngle: bearing + 90
      };
    }
    
    const distanceIntoSegment = targetDistance - segmentStart;
    
    // Use turf.js along function for precise geographic interpolation
    const lineSegment = turf.lineString([coordinates[segmentIndex], coordinates[segmentIndex + 1]]);
    const interpolatedPoint = turf.along(lineSegment, distanceIntoSegment / 1000, { units: 'kilometers' });
    
    // Calculate bearing with high precision
    const startPoint = turf.point(coordinates[segmentIndex]);
    const endPoint = turf.point(coordinates[segmentIndex + 1]);
    const bearing = turf.bearing(startPoint, endPoint);
    const houseAngle = bearing + 90; // Perpendicular to road

    return { 
      lng: interpolatedPoint.geometry.coordinates[0], 
      lat: interpolatedPoint.geometry.coordinates[1], 
      bearing: bearing,
      houseAngle: houseAngle
    };
  }

  /**
   * Create a house object at a specific position (geographic coordinates)
   * @param {Object} position - Position with lng, lat, bearing
   * @param {Object} houseType - House type definition
   * @param {number} roadIndex - Index of the road
   * @param {string} houseIndex - Index/ID of the house on this road
   * @param {number} sideMultiplier - -1 for left side, 1 for right side
   * @returns {Object} House object with all positioning data
   */
  createHouseAtPosition(position, houseType, roadIndex, houseIndex, sideMultiplier) {
    // Calculate offset position (3m from road centerline) using turf.js
    const roadPoint = turf.point([position.lng, position.lat]);
    const offsetBearing = position.houseAngle + (sideMultiplier > 0 ? 0 : 180); // Left or right side
    const offsetDistance = this.roadOffset / 1000; // Convert meters to kilometers for turf
    
    const offsetPoint = turf.destination(roadPoint, offsetDistance, offsetBearing, { units: 'kilometers' });

    // Calculate house orientation (face the road)
    const houseOrientation = position.bearing + (sideMultiplier > 0 ? 90 : -90);

    // Transform house geometry to world coordinates using turf.js and exact geometry
    const worldGeometry = this.transformHouseGeometryGeo(
      houseType.geometry, // Use exact geometry from JSON
      offsetPoint.geometry.coordinates[0], // lng
      offsetPoint.geometry.coordinates[1], // lat
      houseOrientation // house orientation for proper facing
    );

    return {
      id: `house_${roadIndex}_${houseIndex}`,
      type: houseType.type,
      color: houseType.color,
      lng: offsetPoint.geometry.coordinates[0],
      lat: offsetPoint.geometry.coordinates[1],
      bearing: houseOrientation,
      width: houseType.width,
      length: houseType.length,
      geometry: worldGeometry,
      originalGeometry: houseType.geometry,
      roadIndex: roadIndex,
      houseIndex: houseIndex,
      side: sideMultiplier > 0 ? 'right' : 'left'
    };
  }

  /**
   * Transform house geometry to world coordinates
   * @param {Array} geometry - Local house geometry
   * @param {number} worldX - World X position
   * @param {number} worldY - World Y position
   * @param {number} angle - Rotation angle
   * @returns {Array} Transformed geometry
   */
  transformHouseGeometry(geometry, worldX, worldY, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return geometry.map(([localX, localY]) => {
      // Rotate and translate
      const rotatedX = localX * cos - localY * sin;
      const rotatedY = localX * sin + localY * cos;
      
      return [worldX + rotatedX, worldY + rotatedY];
    });
  }

  /**
   * Transform house geometry to geographic coordinates using turf.js
   * @param {Array} geometry - Local house geometry in meters
   * @param {number} centerLng - Center longitude
   * @param {number} centerLat - Center latitude  
   * @param {number} bearing - House orientation bearing
   * @returns {Array} Transformed geometry in geographic coordinates
   */
  transformHouseGeometryGeo(geometry, centerLng, centerLat, bearing) {
    const center = turf.point([centerLng, centerLat]);
    
    return geometry.map(([localX, localY]) => {
      // Convert local meters to distance and bearing from center
      const distance = Math.sqrt(localX * localX + localY * localY) / 1000; // Convert to km
      const localBearing = Math.atan2(localX, localY) * 180 / Math.PI; // Convert to degrees
      const worldBearing = bearing + localBearing; // Rotate by house bearing
      
      // Use turf.js to calculate the world position
      if (distance > 0) {
        const worldPoint = turf.destination(center, distance, worldBearing, { units: 'kilometers' });
        return worldPoint.geometry.coordinates;
      } else {
        return [centerLng, centerLat];
      }
    });
  }

  /**
   * Get all generated houses
   * @returns {Array} Array of all generated house objects
   */
  getHouses() {
    return this.generatedHouses;
  }

  /**
   * Clear all generated houses
   */
  clearHouses() {
    this.generatedHouses = [];
    console.log('🧹 Cleared all generated houses');
  }

  /**
   * Check if a house geometry intersects with any road geometry
   * @param {Object} house - House object with geometry
   * @param {number} defaultBufferMeters - Default buffer around roads to avoid (default 6m)
   * @param {number} excludeRoadIndex - Index of road to exclude from collision check (the road the house is being placed along)
   * @returns {boolean} True if house intersects with roads
   */
  checkHouseRoadCollision(house, defaultBufferMeters = 6, excludeRoadIndex = -1) {
    if (!this.allRoadGeometries || this.allRoadGeometries.length === 0) {
      return false; // No roads to check against
    }

    try {
      // Create house polygon from geometry
      const houseCoords = [...house.geometry, house.geometry[0]]; // Ensure closed polygon
      const housePolygon = turf.polygon([houseCoords]);
      
      // Check collision against all road geometries (except the one this house is placed along)
      for (let i = 0; i < this.allRoadGeometries.length; i++) {
        // Skip the road this house is specifically being placed along
        if (i === excludeRoadIndex) {
          continue;
        }
        
        const road = this.allRoadGeometries[i];
        
        try {
          // Determine buffer size based on road type
          let bufferMeters = defaultBufferMeters;
          if (road.properties && road.properties.Layer) {
            switch (road.properties.Layer) {
              case 'ROAD_PRIMARY':
                bufferMeters = 8; // Wider buffer for primary roads
                break;
              case 'ROAD_SECONDARY':
                bufferMeters = 6; // Standard buffer for secondary roads
                break;
              case 'ROAD_TERTIARY':
                bufferMeters = 4; // Smaller buffer for tertiary roads
                break;
              default:
                bufferMeters = defaultBufferMeters;
            }
          }
          
          // Create buffered road line (road width + safety buffer)
          const roadLine = turf.lineString(road.geometry.coordinates);
          const roadBuffer = turf.buffer(roadLine, bufferMeters, { units: 'meters' });
          
          // Check if house polygon intersects with buffered road
          const intersects = turf.booleanIntersects(housePolygon, roadBuffer);
          
          if (intersects) {
            console.log(`🚫 House collision detected with ${road.properties?.Layer || 'road'} (${bufferMeters}m buffer)`);
            return true;
          }
        } catch (roadError) {
          console.warn('⚠️ Error checking collision with individual road:', roadError);
          continue; // Skip this road and check others
        }
      }
      
      return false; // No collisions detected
    } catch (error) {
      console.warn('⚠️ Error in house-road collision detection:', error);
      return false; // Assume no collision if we can't check properly
    }
  }

  /**
   * Get house statistics
   * @returns {Object} Statistics about generated houses
   */
  getStatistics() {
    const typeCount = {};
    this.generatedHouses.forEach(house => {
      typeCount[house.type] = (typeCount[house.type] || 0) + 1;
    });

    return {
      total: this.generatedHouses.length,
      byType: typeCount,
      roads: this.roads.length
    };
  }

  /**
   * Generate houses along roads with specific parameters
   * @param {Array} roads - Array of road features
   * @param {Object} options - Options for house generation
   * @returns {Object} GeoJSON FeatureCollection of houses
   */
  async generateHousesAlongRoads(roads, options = {}) {
    // Set default options
    this.edgeSpacing = options.edgeSpacing || 5;
    this.roadOffset = options.roadOffset || 10;
    
    // Set roads and generate houses
    this.setRoads(roads);
    const houses = await this.generateHouses();
    
    // Convert to GeoJSON format for map display
    const features = houses.map(house => ({
      type: 'Feature',
      properties: {
        id: house.id,
        houseType: house.type,
        color: house.color,
        width: house.width,
        length: house.length,
        roadIndex: house.roadIndex,
        houseIndex: house.houseIndex,
        height: 4 // 4 meters height for single-story house (more accurate and visible)
      },
      geometry: {
        type: 'Polygon',
        coordinates: [house.geometry]
      }
    }));

    return {
      type: 'FeatureCollection',
      features: features
    };
  }
}

// Make HouseGenerator available globally
window.HouseGenerator = HouseGenerator;

// Make HouseGenerator available globally
window.HouseGenerator = HouseGenerator;