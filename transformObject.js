function Vector3(x, y, z) {
	return { x, y, z };
}

function Triangle(v1, v2, v3, color) {
	return { v1, v2, v3, color };
}

function draw(tri, screen, pixels, zBuffer) {
	const width = screen.width;
	const height = screen.height;

	const [r, g, b] = tri.color;

	const A = tri.v1;
	const B = tri.v2;
	const C = tri.v3;

	// Stop offscreen rendering
	if (
		(A.x < 0 && B.x < 0 && C.x < 0) ||
		(A.x > width && B.x > width && C.x > width) ||
		(A.y < 0 && B.y < 0 && C.y < 0) ||
		(A.y > height && B.y > height && C.y > height)
	) {
		return;
	}

	// Get area of the square defined by the triangle
	let minX = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x)));
	let maxX = Math.min(screen.width - 1, Math.ceil(Math.max(A.x, B.x, C.x)));
	let minY = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y)));
	let maxY = Math.min(screen.height - 1, Math.ceil(Math.max(A.y, B.y, C.y)));

	// Calculate signed area of the triangle
	function edgeEval(a, b, x, y) {
		return (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
	}

	const area = edgeEval(A, B, C.x, C.y);
	const epsilon = 1e-5; // For floating point errors
	if (Math.abs(area) < 1e-3) return;
	const invArea = 1 / area; // Pre-calculate the inverse area to save calculations

	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			// Since the canvas is a 1D arry, get the y location, and add the x to get
			// the right index
			const index = y * width + x;
			// Since each pixel has four values, multiply by 4 to
			// reach the correct location
			const pixelIndex = index * 4;

			// Get signed area of each of the sub-sections of the triangle
			const w0 = edgeEval(A, B, x, y);
			const w1 = edgeEval(B, C, x, y);
			const w2 = edgeEval(C, A, x, y);
			// If pixel is not outside of the triangle, draw
			if (
				(w0 >= -epsilon && w1 >= -epsilon && w2 >= -epsilon) ||
				(w0 <= -epsilon && w1 <= -epsilon && w2 <= -epsilon)
			) {
				// Calculate depth and baycentric coordinates
				const alpha = w0 * invArea;
				const beta = w1 * invArea;
				const gamma = w2 * invArea;
				const depth = alpha * A.z + beta * B.z + gamma * C.z;

				// If the current pixel is closer than the previous location, draw
				// and replace it in the zBuffer
				if (index < 0 || index >= zBuffer.length) continue;
				if (depth < zBuffer[index]) {
					zBuffer[index] = depth;

					pixels[pixelIndex] = r;
					pixels[pixelIndex + 1] = g;
					pixels[pixelIndex + 2] = b;
					pixels[pixelIndex + 3] = 255;
				}
			}
		}
	}
}

// Compare the plane with the triangle, and
// if its outside, attempt to clip it
function clipTriangleAgainstPlane(tri, plane) {
	const vertices = [tri.v1, tri.v2, tri.v3];
	// Get the distance of the each vertex from the plane
	const distToPlane = vertices.map((v) => plane.dist(v));

	const inside = [];
	const outside = [];

	// Sort each vertex to being outisde and inside
	for (let i = 0; i < 3; i++) {
		if (distToPlane[i] >= 0) inside.push(vertices[i]);
		else outside.push(vertices[i]);
	}

	// If all vertices are inside the plane, return it as is
	if (inside.length === 3) return [tri];
	// Else if all of them are outside, return nothing
	if (inside.length === 0) return [];

	// Math shit
	const intersectPlane = (a, b) => {
		const da = plane.dist(a);
		const db = plane.dist(b);
		const t = da / (da - db);
		return Vector3(
			a.x + (b.x - a.x) * t,
			a.y + (b.y - a.y) * t,
			a.z + (b.z - a.z) * t
		);
	};

	// If one vertex is inside, and two are outside the plane:
	if (inside.length === 1 && outside.length === 2) {
		const a = inside[0]; // Inside
		const b = outside[0]; // Outside
		const c = outside[1]; // Outside
		const ab = intersectPlane(a, b, plane); // Cut between the inside and outside vertices
		const ac = intersectPlane(a, c, plane);
		return [Triangle(a, ab, ac, tri.color)];
	}

	// If one vertex is outside, and two are inside the plane:
	if (inside.length === 2 && outside.length === 1) {
		const a = inside[0]; // Inside
		const b = inside[1]; // Inside
		const c = outside[0]; // Outisde
		const ac = intersectPlane(a, c, plane); // Cut between the inside and outside vertices
		const bc = intersectPlane(b, c, plane);
		return [Triangle(a, b, ac, tri.color), Triangle(b, bc, ac, tri.color)];
	}
}

// Check if a vector is in view of the camera
// and if not, clip it
function frustumClipping(triangle, frustumPlanes) {
	let triangles = [triangle];

	// Loop through each of the side of the cameras
	// and attempt to clip the triangle
	for (const plane of frustumPlanes) {
		const newTriangles = [];

		// Attempt to clip the triangle
		for (const tri of triangles) {
			const clipped = clipTriangleAgainstPlane(tri, plane);
			if (clipped) newTriangles.push(...clipped);
		}

		// Add the clipped triangle(s) to be looped over
		triangles = newTriangles;
		// If triangle is outside any plane, stop
		if (triangles.length === 0) break;
	}

	return triangles;
}

// Get the projected values for a vector
function getProjected(v, screen, FOVy) {
	const focalLength = screen.height / 2 / Math.tan(FOVy / 2);
	const cx = screen.width / 2;
	const cy = screen.height / 2;

	let { x, y, z } = v;
	if (z <= 0.01) z = 0.01;

	const projectedX = cx + (x * focalLength) / z;
	const projectedY = cy - (y * focalLength) / z;

	return Vector3(projectedX, projectedY, z);
}

// Cull triangles behind other objects
function occlusionCulling(tri, zBuffer, screen, FOVy) {
	const pv1 = getProjected(tri.v1, screen, FOVy);
	const pv2 = getProjected(tri.v2, screen, FOVy);
	const pv3 = getProjected(tri.v3, screen, FOVy);

	// Get triangle bounding box
	let minX = Math.max(0, Math.floor(Math.min(pv1.x, pv2.x, pv3.x)));
	let maxX = Math.min(
		screen.width - 1,
		Math.ceil(Math.max(pv1.x, pv2.x, pv3.x))
	);
	let minY = Math.max(0, Math.floor(Math.min(pv1.y, pv2.y, pv3.y)));
	let maxY = Math.min(
		screen.height - 1,
		Math.ceil(Math.max(pv1.y, pv2.y, pv3.y))
	);
	if ((maxX - minX) * (maxY - minY) < 1) return;

	const testPoints = [
		[(minX + maxX) / 2, (minY + maxY) / 2], // center
		[minX, minY], // top-left
		[maxX, minY], // top-right
		[minX, maxY], // bottom-left
		[maxX, maxY], // bottom-right
	];

	// Estimate average depth of the triangle
	const minZ = Math.min(pv1.z, pv2.z, pv3.z);

	for (let [x, y] of testPoints) {
		const index = Math.floor(y) * screen.width + Math.floor(x);
		if (minZ < zBuffer[index]) {
			// At least one point is visible → keep
			return Triangle(pv1, pv2, pv3, tri.color);
		}
	}
	// All tested points are behind → cull
	return;
}

// Check if a vector is facing away from the camera by checking
// its cross product
function isBackFace3D(v1, v2, v3) {
	// Calculate two edge vectors
	const U = {
		x: v2.x - v1.x,
		y: v2.y - v1.y,
		z: v2.z - v1.z,
	};
	const V = {
		x: v3.x - v1.x,
		y: v3.y - v1.y,
		z: v3.z - v1.z,
	};

	// Cross product: normal = U × V
	const normal = {
		x: U.y * V.z - U.z * V.y,
		y: U.z * V.x - U.x * V.z,
		z: U.x * V.y - U.y * V.x,
	};

	// View vector: from triangle to camera (camera is at origin in camera space)
	const view = {
		x: -v1.x,
		y: -v1.y,
		z: -v1.z,
	};

	// Dot product
	const dot = normal.x * view.x + normal.y * view.y + normal.z * view.z;

	return dot < 0; // If true, triangle is facing away
}

let sceneObjects = [];

// Rotate a vector
function rotateVector(v, cosX, sinX, cosY, sinY, cosZ, sinZ) {
	let x = v.x,
		y = v.y,
		z = v.z;

	let x1 = x * cosY + z * sinY;
	let z1 = -x * sinY + z * cosY;

	let y1 = y * cosX - z1 * sinX;
	let z2 = y * sinX + z1 * cosX;

	let x2 = x1 * cosZ - y1 * sinZ;
	let y2 = x1 * sinZ + y1 * cosZ;

	return Vector3(x2, y2, z2);
}

// Rotate and project a triangle
function updateVertices(object, camera, angleX, angleY, angleZ) {
	let { vertices, indices } = object;
	vertices = vertices.map((v) => Vector3(v[0], v[1], v[2]));

	const cosX = Math.cos(angleX);
	const sinX = Math.sin(angleX);
	const cosY = Math.cos(angleY);
	const sinY = Math.sin(angleY);
	const cosZ = Math.cos(angleZ);
	const sinZ = Math.sin(angleZ);

	const transformedVertices = vertices.map((v) => {
		const rotated = rotateVector(v, cosX, sinX, cosY, sinY, cosZ, sinZ);
		const camSpace = Vector3(
			rotated.x - camera.x,
			rotated.y - camera.y,
			rotated.z - camera.z
		);
		return rotateVector(
			camSpace,
			camera.cosPitch,
			camera.sinPitch,
			camera.cosYaw,
			camera.sinYaw,
			camera.cosRoll,
			camera.sinRoll
		);
	});

	return indices
		.map(([i1, i2, i3, color]) => {
			const tv1 = transformedVertices[i1];
			const tv2 = transformedVertices[i2];
			const tv3 = transformedVertices[i3];
			if (tv1.z <= 0.01 && tv2.z <= 0.01 && tv3.z <= 0.01) return;
			return Triangle(tv1, tv2, tv3, color);
		})
		.filter(Boolean);
}

onmessage = function (e) {
	if (e.data.type === "init") {
		sceneObjects = e.data.objects;
		return;
	}

	const zBuffer = new Float32Array(e.data.zBuffer);
	const pixels = new Uint8ClampedArray(e.data.pixels);

	const { camera, screenHeight, screenWidth, FOVy, FOVx, NEAR, FAR } = e.data;
	const screen = { width: screenWidth, height: screenHeight };

	const frustumPlanes = [
		{ dist: (v) => v.z - NEAR }, // near
		{ dist: (v) => FAR - v.z }, // far
		{ dist: (v) => v.x + v.z * Math.tan(FOVx * 0.5) }, // left
		{ dist: (v) => v.z * Math.tan(FOVx * 0.5) - v.x }, // right
		{ dist: (v) => v.y + v.z * Math.tan(FOVy * 0.5) }, // bottom
		{ dist: (v) => v.z * Math.tan(FOVy * 0.5) - v.y }, // top
	];

	for (let obj of sceneObjects) {
		const transformed = updateVertices(obj, camera, 0, 0, 0);

		for (let tri of transformed) {
			if (!isBackFace3D(tri.v1, tri.v2, tri.v3)) {
				const clippedTriangles = frustumClipping(tri, frustumPlanes);
				for (const clipped of clippedTriangles) {
					const culled = occlusionCulling(clipped, zBuffer, screen, FOVy);
					if (culled) {
						draw(culled, screen, pixels, zBuffer);
					}
				}
			}
		}
	}

	postMessage(
		{
			pixels: pixels.buffer,
			zBuffer: zBuffer.buffer,
		},
		[pixels.buffer, zBuffer.buffer]
	);
};
