#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
  uint32_t *rgba; // contiguous pixels in this row
  uint16_t *dx;   // x offsets for each pixel in this row
  size_t count;   // number of pixels in this row
} pumpkin_row_t;

typedef struct {
  pumpkin_row_t *rows; // array of rows (size = pumpkin_height)
  size_t height;       // total rows
  uint16_t width;      // pumpkin width
  uint16_t first_pixel_dx;
  uint16_t first_pixel_dy;
} pumpkin_t;

void pumpkin_destroy(pumpkin_t *p);
bool pumpkin_init(pumpkin_t *p, const uint8_t *rgba, uint32_t width,
                  uint32_t height, uint32_t channels);
bool pumpkin_find(const pumpkin_t *p, const uint8_t *search,
                  uint32_t search_width, uint32_t search_height,
                  uint32_t channels, uint32_t *out_x, uint32_t *out_y);
