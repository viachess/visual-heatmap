const isNumber = (param) => typeof param === 'number';
const NOT_A_NUMBER_TYPE_ERROR_MESSAGE = 'Wrong parameter type, must be a number';
const isUndefined = (param) => param === undefined;
const UNDEFINED_PARAM_ERROR_MESSAGE = 'Parameter is undefined, pass number as a parameter';

function checkNumberParameter (param) {
	if (isUndefined(param)) {
		throw new ReferenceError(UNDEFINED_PARAM_ERROR_MESSAGE);
	} else if (!isNumber(param)) {
		throw new TypeError(NOT_A_NUMBER_TYPE_ERROR_MESSAGE);
	}
}

function getPixelRatio (ctx) {
	const dpr = window.devicePixelRatio || 1;
	const bsr = ctx.webkitBackingStorePixelRatio ||
        ctx.mozBackingStorePixelRatio ||
        ctx.msBackingStorePixelRatio ||
        ctx.oBackingStorePixelRatio ||
        ctx.backingStorePixelRatio || 1;

	return dpr / bsr;
}

var GradvertexShader = `
	attribute vec2 a_position;
	attribute float a_intensity;
	uniform float u_size;
	uniform vec2 u_resolution;
	uniform vec2 u_translate; 
	uniform float u_zoom; 
	uniform float u_angle; 
	uniform float u_density;
	varying float v_i;

	vec2 rotation(vec2 v, float a) {
		float s = sin(a); float c = cos(a); mat2 m = mat2(c, -s, s, c); 
		return m * v;
	}

	void main() {
		vec2 zeroToOne = (a_position * u_density + u_translate * u_density) / (u_resolution);
		vec2 zeroToTwo = zeroToOne * 2.0 - 1.0;
		zeroToTwo = zeroToTwo / u_zoom;
		if (u_angle != 0.0) {
			zeroToTwo = rotation(zeroToTwo, u_angle);
		}
		gl_Position = vec4(zeroToTwo , 0, 1);
		gl_PointSize = u_size * u_density;
		v_i = a_intensity;
	}`;

var GradfragmentShader = `
	precision mediump float;
	uniform float u_max;
	uniform float u_blur;
	varying float v_i;
	void main() {
		float r = 0.0; 
		vec2 cxy = 2.0 * gl_PointCoord - 1.0;
		r = dot(cxy, cxy);
		if(r <= 1.0) {
			gl_FragColor = vec4(0, 0, 0, (v_i/u_max) * u_blur * (1.0 - sqrt(r)));
		}
	}`;


var ColorvertexShader = `
	attribute vec2 a_texCoord;
	varying vec2 v_texCoord;
	void main() {
		vec2 clipSpace = a_texCoord * 2.0 - 1.0;
		gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
		v_texCoord = a_texCoord;
	}`;

// u_colorArr[100] means that this uniform takes up uniform 100 locations
var ColorfragmentShader = `
	precision mediump float;
	varying vec2 v_texCoord;
	uniform sampler2D u_framebuffer; uniform vec4 u_colorArr[100]; uniform float u_colorCount; uniform float u_opacity; uniform float u_offset[100];
	
	float remap ( float minval, float maxval, float curval ) {
		return ( curval - minval ) / ( maxval - minval );
	}

	void main() {
		float alpha = texture2D(u_framebuffer, v_texCoord.xy).a;
		if (alpha > 0.0 && alpha <= 1.0) {
			vec4 color_;
			if (alpha <= u_offset[0]) {
				color_ = u_colorArr[0];
			} else if (alpha <= u_offset[1]) {
				color_ = mix( u_colorArr[0], u_colorArr[1], remap( u_offset[0], u_offset[1], alpha ) );
			} else if (alpha <= u_offset[2]) {
				color_ = mix( u_colorArr[1], u_colorArr[2], remap( u_offset[1], u_offset[2], alpha ) );
			} else if (alpha <= u_offset[3]) {
				color_ = mix( u_colorArr[2], u_colorArr[3], remap( u_offset[2], u_offset[3], alpha ) );
			} else if (alpha <= u_offset[4]) {
				color_ = mix( u_colorArr[3], u_colorArr[4], remap( u_offset[3], u_offset[4], alpha ) );
			} else if (alpha <= u_offset[5]) {
				color_ = mix( u_colorArr[4], u_colorArr[5], remap( u_offset[4], u_offset[5], alpha ) );
			} else if (alpha <= u_offset[6]) {
				color_ = mix( u_colorArr[5], u_colorArr[6], remap( u_offset[5], u_offset[6], alpha ) );
			} else if (alpha <= u_offset[7]) {
				color_ = mix( u_colorArr[6], u_colorArr[7], remap( u_offset[6], u_offset[7], alpha ) );
			} else if (alpha <= u_offset[8]) {
				color_ = mix( u_colorArr[7], u_colorArr[8], remap( u_offset[7], u_offset[8], alpha ) );
			} else if (alpha <= u_offset[9]) {
				color_ = mix( u_colorArr[8], u_colorArr[9], remap( u_offset[8], u_offset[9], alpha ) );
			} else if (alpha <= u_offset[10]) {
				color_ = mix( u_colorArr[9], u_colorArr[10], remap( u_offset[9], u_offset[10], alpha ) );
			} else {
				color_ = vec4(0.0, 0.0, 0.0, 0.0);
			}
			color_.a = color_.a - (1.0 - u_opacity);
			if (color_.a < 0.0) {
				color_.a = 0.0;
			}
			gl_FragColor = color_;
		}
	}`;

/**
 * @typedef { Object } GradientColorPoint
 * @property { number[] } color - RGBA values array, e.g. [0, 0, 255, 1.0]
 * @property { number } offset - color position in gradient, ranges from 0.0 to 1.0
 */
/**
 * @typedef { Object } GradientPointsMap
 * @property { Float32Array } value - flattened array of normalized rgba values in range from 0 to 1
 * @property { number } length - normalized color points array length
 * @property { Float32Array } offset - array of color points offset values (from 0 to 1) 
 */

function Heatmap (containerElementSelector, config = {}) {
	/**
	 * 
	 * @param { GradientColorPoint[] } gradientColorPointsArray
	 * @returns { GradientPointsMap } Gradient points data for Color Fragment shader
	 */
	function gradientMapper (gradientColorPointsArray) {
		const arr = [];
		const gradientColorPointsArrayLength = gradientColorPointsArray.length;
		const offSetsArray = [];

		gradientColorPointsArray.forEach(
			/**
			 * @description Forces rgb values into range from 0 to 1
			 * @param {GradientColorPoint} gradientPoint
			 */
			function (gradientPoint) {
				const red = gradientPoint.color[0];
				const green = gradientPoint.color[1];
				const blue = gradientPoint.color[2];
				const alpha = gradientPoint.color[3] === undefined ? 1.0 : gradientPoint.color[3];
				arr.push(red / 255);
				arr.push(green / 255);
				arr.push(blue / 255);
				arr.push(alpha);
				offSetsArray.push(gradientPoint.offset);
			});

		return {
			value: new Float32Array(arr), // flattened array of rgba values in range from 0 to 1
			length: gradientColorPointsArrayLength, // normalized color points array length
			offset: new Float32Array(offSetsArray) // array of color points offset values (from 0 to 1)
		};
	}

	/**
	 * 
	 * @param { WebGLRenderingContext } ctx
	 * @param { 'VERTEX_SHADER' | 'FRAGMENT_SHADER' } shaderType
	 * @param { String } src - raw GLSL code for shader
	 */
	function createShader (ctx, shaderType, src) {
		var shader = ctx.createShader(ctx[shaderType]);
		ctx.shaderSource(shader, src);
		ctx.compileShader(shader);
		var compiled = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
		if (!compiled) {
			var lastError = ctx.getShaderInfoLog(shader);
			console.error("*** Error compiling shader '" + shader + "':" + lastError);
			ctx.deleteShader(shader);
		}
		return shader;
	}

	function createGradientShader (ctx) {
		var vshader = createShader(ctx, 'VERTEX_SHADER', GradvertexShader);
		var fshader = createShader(ctx, 'FRAGMENT_SHADER', GradfragmentShader);
		var program = ctx.createProgram();

		ctx.attachShader(program, vshader);
		ctx.attachShader(program, fshader);
		ctx.linkProgram(program);

		var linked = ctx.getProgramParameter(program, ctx.LINK_STATUS);
		if (!linked) {
			var lastError = ctx.getProgramInfoLog(program);
			console.error('Error in program linking:' + lastError);
			ctx.deleteProgram(program);
		}

		return {
			program: program,
			attr: [{
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 2,
				attribute: ctx.getAttribLocation(program, 'a_position'),
				data: new Float32Array([])
			}, {
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 1,
				attribute: ctx.getAttribLocation(program, 'a_intensity'),
				data: new Float32Array([])
			}],
			uniform: {
				u_resolution: ctx.getUniformLocation(program, 'u_resolution'),
				u_max: ctx.getUniformLocation(program, 'u_max'),
				u_size: ctx.getUniformLocation(program, 'u_size'),
				u_blur: ctx.getUniformLocation(program, 'u_blur'),
				u_translate: ctx.getUniformLocation(program, 'u_translate'),
				u_zoom: ctx.getUniformLocation(program, 'u_zoom'),
				u_angle: ctx.getUniformLocation(program, 'u_angle'),
				u_density: ctx.getUniformLocation(program, 'u_density')
			}
		};
	}

	/**
	 * TODO: add return object type definitions
	 * @param {WebGLRenderingContext} ctx 
	 */
	function createColorShader (ctx) {
		var vshader = createShader(ctx, 'VERTEX_SHADER', ColorvertexShader);
		var fshader = createShader(ctx, 'FRAGMENT_SHADER', ColorfragmentShader);
		var program = ctx.createProgram();
		ctx.attachShader(program, vshader);
		ctx.attachShader(program, fshader);
		ctx.linkProgram(program);

		var linked = ctx.getProgramParameter(program, ctx.LINK_STATUS);
		if (!linked) {
			var lastError = ctx.getProgramInfoLog(program);
			console.error('Error in program linking:' + lastError);
			ctx.deleteProgram(program);
		}

		return {
			program: program,
			attr: [{
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 2,
				attribute: ctx.getAttribLocation(program, 'a_texCoord'),
				data: new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0])
			}],
			uniform: {
				u_framebuffer: ctx.getUniformLocation(program, 'u_framebuffer'),
				u_colorArr: ctx.getUniformLocation(program, 'u_colorArr'),
				u_colorCount: ctx.getUniformLocation(program, 'u_colorCount'),
				u_opacity: ctx.getUniformLocation(program, 'u_opacity'),
				u_offset: ctx.getUniformLocation(program, 'u_offset')
			}
		};
	}

	/** 
	 * Device pixel ratio
	 * @type { number }
	*/
	let ratio;
	/**
	 * Buffer for position vectors Float32Array
	 * @type { ArrayBuffer }
	 */
	let buffer;
	/**
	 * flattened xy vector (vec2) coordinates container [x, y, x1, y1, x2, y2 etc...]
	 * @type { Float32Array }
	 */
	let positionVectorsArray = [];
	/**
	 * Buffer for radius vectors Float32Array
	 * @type { ArrayBuffer }
	 */
	let buffer2;
	/**
	 * Point radius vector (vec1) container [r1, r2, r3, etc...]
	 * @type { Float32Array }
	 */
	let radiusVectorsArray = [];
	/** 
	 * point length?? TODO: Fix description
	 * @type { number }
	 */
	let pLen = 0;
	
	/**
	 * @typedef { Object } HeatmapDataPoint
	 * @property { number } x - x position on 2d plane
	 * @property { number } y - y position on 2d plane
	 * @property { number } value - current value for gradient calculation
	 */

	/**
	 * @typedef { Object } ExtractedData
	 * @property { Float32Array } posVec
	 * @property { Float32Array } rVec
	 */
	/**
	 * 
	 * @param { HeatmapDataPoint[] } heatmapPoints 
	 * @returns { ExtractedData }
	 */
	function extractData (heatmapPoints) {
		const len = heatmapPoints.length;
		if (pLen !== len) {
			buffer = new ArrayBuffer(len * 8);
			positionVectorsArray = new Float32Array(buffer);
			buffer2 = new ArrayBuffer(len * 4);
			radiusVectorsArray = new Float32Array(buffer2);
			pLen = len;
		}
		for (let i = 0; i < len; i++) {
			positionVectorsArray[i * 2] = heatmapPoints[i].x;
			positionVectorsArray[(i * 2) + 1] = heatmapPoints[i].y;
			radiusVectorsArray[i] = heatmapPoints[i].value;
		}
		return {
			posVec: positionVectorsArray,
			rVec: radiusVectorsArray
		};
	}

	function Chart (containerElementSelector, config) {
		const res = document.querySelector(containerElementSelector);
		const height = res.clientHeight;
		const width = res.clientWidth;
		const layer = document.createElement('canvas');
		const gl = layer.getContext('webgl', {
			premultipliedAlpha: false,
			depth: false,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: false
		});
		ratio = getPixelRatio(gl);
		// console.log('pixel ratio: ', ratio);
		gl.clearColor(0, 0, 0, 0);
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(true);
		layer.setAttribute('height', height * ratio);
		layer.setAttribute('width', width * ratio);
		layer.style.height = `${height}px`;
		layer.style.width = `${width}px`;
		layer.style.position = 'absolute';
		res.appendChild(layer);

		this.gradient = gradientMapper(config.gradient);
		this.ctx = gl;
		this.width = width * ratio;
		this.height = height * ratio;
		this.layer = layer;
		this.dom = res;
		this.gradShadOP = createGradientShader(this.ctx);
		this.colorShadOP = createColorShader(this.ctx);
		this.fbTexObj = gl.createTexture();
		this.fbo = gl.createFramebuffer();

		this.size = config.size ? config.size : 20.0;
		this.max = config.max ? config.max : Infinity;
		this.blur = config.blur ? config.blur : 1.0;
		this.translate = (config.translate && config.translate.length === 2) ? config.translate : [0, 0];
		this.zoom = (config.zoom ? config.zoom : 1.0);
		this.angle = (config.rotationAngle ? config.rotationAngle : 0.0);
		this.opacity = config.opacity ? config.opacity : 1.0;
		this.ratio = ratio;

		this.rawData = [];

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	}

	Chart.prototype.resize = function () {
		const height = this.dom.clientHeight;
		const width = this.dom.clientWidth;
		this.layer.setAttribute('height', height * ratio);
		this.layer.setAttribute('width', width * ratio);
		this.layer.style.height = `${height}px`;
		this.layer.style.width = `${width}px`;
		this.width = width * ratio;
		this.height = height * ratio;
		this.ctx.viewport(0, 0, this.width, this.height);

		/* Perform update */
		this.render(this.exData);
	};

	Chart.prototype.clear = function () {
		this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT);
	};

	Chart.prototype.setMax = function (max) {
		this.max = max;
		this.render(this.exData);
	};

	Chart.prototype.setTranslate = function (translate) {
		if (Array.isArray(translate) && translate.length === 2 && translate.every((value) => typeof value === 'number')) {
			 this.translate = translate;
		} else {
			throw new TypeError('Wrong parameter value, must be an array with two numbers');
		}
		this.render(this.exData);
	};

	Chart.prototype.setZoom = function (zoom) {
		checkNumberParameter(zoom);
		this.zoom = zoom;
		this.render(this.exData);
	};

	Chart.prototype.setRotationAngle = function (angle) {
		checkNumberParameter(angle);
		this.angle = angle;
		this.render(this.exData);
	};

	Chart.prototype.setSize = function (size) {
		checkNumberParameter(size);
		this.size = size;
		this.render(this.exData);
	};

	Chart.prototype.setBlur = function (blur) {
		checkNumberParameter(blur);
		this.blur = blur;
		this.render(this.exData);
	};

	Chart.prototype.setOpacity = function (opacity) {
		checkNumberParameter(opacity);
		this.opacity = opacity !== undefined ? opacity : 1.0;
		this.render(this.exData);
	};
  
	/**
	 * 
	 * @param {  } data 
	 * @param {*} transIntactFlag 
	 */
	Chart.prototype.addData = function (data, transIntactFlag) {
		const self = this;
		for (let i = 0; i < data.length; i++) {
			if (transIntactFlag) {
				transCoOr.call(self, data[i]);
			}
			this.rawData.push(data[i]);
		}
		this.renderData(this.rawData);
	};

	Chart.prototype.renderData = function (data) {
		const exData = extractData(data);
		this.rawData = data;
		this.render(exData);
	};

	Chart.prototype.render = function (exData) {
		const ctx = this.ctx;
		this.exData = exData;
		this.gradShadOP.attr[0].data = exData.posVec;
		this.gradShadOP.attr[1].data = exData.rVec;
		
		ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
		
		ctx.useProgram(this.gradShadOP.program);

		ctx.uniform2fv(this.gradShadOP.uniform.u_resolution, new Float32Array([this.width, this.height]));
		ctx.uniform2fv(this.gradShadOP.uniform.u_translate, new Float32Array([this.translate[0], this.translate[1]]));
		ctx.uniform1f(this.gradShadOP.uniform.u_zoom, this.zoom ? this.zoom : 0.01);
		ctx.uniform1f(this.gradShadOP.uniform.u_angle, this.angle);
		ctx.uniform1f(this.gradShadOP.uniform.u_density, this.ratio);
		ctx.uniform1f(this.gradShadOP.uniform.u_max, this.max);
		ctx.uniform1f(this.gradShadOP.uniform.u_size, this.size);
		ctx.uniform1f(this.gradShadOP.uniform.u_blur, this.blur);
		
		this.gradShadOP.attr.forEach(function (d) {
			ctx.bindBuffer(d.bufferType, d.buffer);
			ctx.bufferData(d.bufferType, d.data, d.drawType);
			ctx.enableVertexAttribArray(d.attribute);
			ctx.vertexAttribPointer(d.attribute, d.size, d.valueType, true, 0, 0);
		});

		ctx.bindTexture(ctx.TEXTURE_2D, this.fbTexObj);
		ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, this.width, this.height, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, null);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);

		ctx.bindFramebuffer(ctx.FRAMEBUFFER, this.fbo);
		ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, this.fbTexObj, 0);

		ctx.drawArrays(ctx.POINTS, 0, exData.posVec.length / 2);
		ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
		ctx.useProgram(this.colorShadOP.program);

		ctx.uniform4fv(this.colorShadOP.uniform.u_colorArr, this.gradient.value);
		ctx.uniform1f(this.colorShadOP.uniform.u_colorCount, this.gradient.length);
		ctx.uniform1fv(this.colorShadOP.uniform.u_offset, this.gradient.offset);
		ctx.uniform1f(this.colorShadOP.uniform.u_opacity, this.opacity);

		this.colorShadOP.attr.forEach(function (d) {
			ctx.bindBuffer(d.bufferType, d.buffer);
			ctx.bufferData(d.bufferType, d.data, d.drawType);
			ctx.enableVertexAttribArray(d.attribute);
			ctx.vertexAttribPointer(d.attribute, d.size, d.valueType, true, 0, 0);
		});

		ctx.uniform1i(this.colorShadOP.uniform.u_framebuffer, 0);
		ctx.activeTexture(ctx.TEXTURE0);
		ctx.bindTexture(ctx.TEXTURE_2D, this.fbTexObj);

		ctx.drawArrays(ctx.TRIANGLES, 0, 6);
	};

	function transCoOr (data) {
		const widFat = this.width / (2 * ratio);
		const heiFat = this.height / (2 * ratio);
		data.x -= widFat;
		data.y -= heiFat;

		data.x /= widFat;
		data.y /= heiFat;
		data.x = data.x * (this.zoom);
		data.y = data.y * (this.zoom);

		if (this.angle !== 0.0) {
			const c = Math.cos(this.angle);
			const s = Math.sin(this.angle);
			const x = data.x;
			const y = data.y;
			data.x = (c * x) + (-s * y);
			data.y = (s * x) + (c * y);
		}

		data.x *= widFat;
		data.y *= heiFat;
		data.x += widFat;
		data.y += heiFat;

		data.x -= (this.translate[0]);
		data.y -= (this.translate[1]);
	}

	return new Chart(containerElementSelector, config);
}

export default Heatmap;
