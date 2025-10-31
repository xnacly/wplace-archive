#include <node_api.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
	uint16_t dx;
	uint16_t dy;
	uint8_t rgba[4];
} sample_pixel_t;

static sample_pixel_t *pumpkin_pixels = NULL;
static uint32_t pumpkin_width = 0;
static uint32_t pumpkin_height = 0;
static uint32_t pumpkin_channels = 0;
static size_t pumpkin_pixel_count = 0;
static uint16_t first_pixel_dx = 0;
static uint16_t first_pixel_dy = 0;

#define NAPI_CALL(env, call)                     \
	do {                                         \
		napi_status status = (call);            \
		if (status != napi_ok) {                \
			const napi_extended_error_info *info; \
			napi_get_last_error_info((env), &info); \
			const char *message = info ? info->error_message : "Unknown error"; \
			napi_throw_error((env), NULL, message); \
			return NULL;                        \
		}                                        \
	} while (0)

static void clear_pumpkin_pixels(void) {
	if (pumpkin_pixels != NULL) {
		free(pumpkin_pixels);
		pumpkin_pixels = NULL;
	}
	pumpkin_pixel_count = 0;
	pumpkin_width = 0;
	pumpkin_height = 0;
	pumpkin_channels = 0;
	first_pixel_dx = 0;
	first_pixel_dy = 0;
}

static napi_value set_pumpkin_data(napi_env env, napi_callback_info info) {
	size_t argc = 4;
	napi_value argv[4];
	NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));

	if (argc < 4) {
		napi_throw_type_error(env, NULL, "Expected buffer, width, height, and channels");
		return NULL;
	}

	void *data_ptr;
	size_t data_length;
	NAPI_CALL(env, napi_get_buffer_info(env, argv[0], &data_ptr, &data_length));

	uint32_t width;
	uint32_t height;
	uint32_t channels;
	NAPI_CALL(env, napi_get_value_uint32(env, argv[1], &width));
	NAPI_CALL(env, napi_get_value_uint32(env, argv[2], &height));
	NAPI_CALL(env, napi_get_value_uint32(env, argv[3], &channels));

	if (channels != 4) {
		napi_throw_range_error(env, NULL, "Pumpkin image must have 4 channels");
		return NULL;
	}

	size_t expected_length = (size_t)width * (size_t)height * (size_t)channels;
	if (data_length < expected_length) {
		napi_throw_range_error(env, NULL, "Pumpkin buffer is smaller than expected");
		return NULL;
	}

	const uint8_t *pixels = (const uint8_t *)data_ptr;

	size_t opaque_count = 0;
	for (uint32_t y = 0; y < height; y++) {
		for (uint32_t x = 0; x < width; x++) {
			size_t idx = ((size_t)y * (size_t)width + (size_t)x) * (size_t)channels;
			if (pixels[idx + 3] == 255) {
				if (opaque_count == 0) {
					first_pixel_dx = (uint16_t)x;
					first_pixel_dy = (uint16_t)y;
				}
				opaque_count++;
			}
		}
	}

	if (opaque_count == 0) {
		napi_throw_range_error(env, NULL, "Pumpkin image has no fully opaque pixels");
		return NULL;
	}

	sample_pixel_t *new_pixels = (sample_pixel_t *)malloc(sizeof(sample_pixel_t) * opaque_count);
	if (new_pixels == NULL) {
		napi_throw_error(env, NULL, "Failed to allocate memory for pumpkin pixels");
		return NULL;
	}

	size_t write_index = 0;
	for (uint32_t y = 0; y < height; y++) {
		for (uint32_t x = 0; x < width; x++) {
			size_t idx = ((size_t)y * (size_t)width + (size_t)x) * (size_t)channels;
			if (pixels[idx + 3] == 255) {
				sample_pixel_t *sample = &new_pixels[write_index++];
				sample->dx = (uint16_t)x;
				sample->dy = (uint16_t)y;
				memcpy(sample->rgba, &pixels[idx], 4);
			}
		}
	}

	clear_pumpkin_pixels();

	pumpkin_pixels = new_pixels;
	pumpkin_pixel_count = opaque_count;
	pumpkin_width = width;
	pumpkin_height = height;
	pumpkin_channels = channels;

	return NULL;
}

static napi_value find_pumpkin(napi_env env, napi_callback_info info) {
	if (pumpkin_pixels == NULL || pumpkin_pixel_count == 0) {
		napi_throw_error(env, NULL, "Pumpkin data not initialized");
		return NULL;
	}

	size_t argc = 4;
	napi_value argv[4];
	NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));

	if (argc < 4) {
		napi_throw_type_error(env, NULL, "Expected buffer, width, height, and channels");
		return NULL;
	}

	void *data_ptr;
	size_t data_length;
	NAPI_CALL(env, napi_get_buffer_info(env, argv[0], &data_ptr, &data_length));

	uint32_t width;
	uint32_t height;
	uint32_t channels;
	NAPI_CALL(env, napi_get_value_uint32(env, argv[1], &width));
	NAPI_CALL(env, napi_get_value_uint32(env, argv[2], &height));
	NAPI_CALL(env, napi_get_value_uint32(env, argv[3], &channels));

	if (channels != 4) {
		napi_throw_range_error(env, NULL, "Search image must have 4 channels");
		return NULL;
	}

	size_t expected_length = (size_t)width * (size_t)height * (size_t)channels;
	if (data_length < expected_length) {
		napi_throw_range_error(env, NULL, "Search buffer is smaller than expected");
		return NULL;
	}

	if (width < pumpkin_width || height < pumpkin_height) {
		napi_value null_value;
		NAPI_CALL(env, napi_get_null(env, &null_value));
		return null_value;
	}

	const uint8_t *search_pixels = (const uint8_t *)data_ptr;

	uint32_t max_x = width - pumpkin_width;
	uint32_t max_y = height - pumpkin_height;

	for (uint32_t sy = 0; sy <= max_y; sy++) {
		for (uint32_t sx = 0; sx <= max_x; sx++) {
			bool matched = true;

			for (size_t i = 0; i < pumpkin_pixel_count; i++) {
				const sample_pixel_t *sample = &pumpkin_pixels[i];
				size_t idx =
					(((size_t)sy + (size_t)sample->dy) * (size_t)width +
					 ((size_t)sx + (size_t)sample->dx)) *
					(size_t)channels;

				const uint8_t *candidate = &search_pixels[idx];

				if (candidate[0] != sample->rgba[0] ||
					candidate[1] != sample->rgba[1] ||
					candidate[2] != sample->rgba[2] ||
					candidate[3] != sample->rgba[3]) {
					matched = false;
					break;
				}
			}

			if (matched) {
				napi_value result;
				NAPI_CALL(env, napi_create_object(env, &result));

				napi_value x_value;
				napi_value y_value;
				NAPI_CALL(env, napi_create_uint32(env, sx + (uint32_t)first_pixel_dx, &x_value));
				NAPI_CALL(env, napi_create_uint32(env, sy + (uint32_t)first_pixel_dy, &y_value));

				NAPI_CALL(env, napi_set_named_property(env, result, "x", x_value));
				NAPI_CALL(env, napi_set_named_property(env, result, "y", y_value));

				return result;
			}
		}
	}

	napi_value null_value;
	NAPI_CALL(env, napi_get_null(env, &null_value));
	return null_value;
}

static napi_value clear_pumpkin(napi_env env, napi_callback_info info) {
	(void)info;
	clear_pumpkin_pixels();
	return NULL;
}

static void addon_cleanup(void *arg) {
	(void)arg;
	clear_pumpkin_pixels();
}

static napi_value init(napi_env env, napi_value exports) {
	napi_value set_fn;
	NAPI_CALL(env, napi_create_function(env, "setPumpkinData", NAPI_AUTO_LENGTH, set_pumpkin_data, NULL, &set_fn));
	NAPI_CALL(env, napi_set_named_property(env, exports, "setPumpkinData", set_fn));

	napi_value find_fn;
	NAPI_CALL(env, napi_create_function(env, "findPumpkin", NAPI_AUTO_LENGTH, find_pumpkin, NULL, &find_fn));
	NAPI_CALL(env, napi_set_named_property(env, exports, "findPumpkin", find_fn));

	napi_value clear_fn;
	NAPI_CALL(env, napi_create_function(env, "clearPumpkinData", NAPI_AUTO_LENGTH, clear_pumpkin, NULL, &clear_fn));
	NAPI_CALL(env, napi_set_named_property(env, exports, "clearPumpkinData", clear_fn));

	NAPI_CALL(env, napi_add_env_cleanup_hook(env, addon_cleanup, NULL));

	return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
