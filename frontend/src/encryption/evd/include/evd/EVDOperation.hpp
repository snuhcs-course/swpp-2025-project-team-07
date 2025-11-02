#pragma once

#include "Type.hpp"

namespace evd {
enum class Operation : u8 {
  SETUP = 0,
  INSERT = 1,
  QUERY = 2,
  QUERY_PTXT = 3,
  TERMINATE = 4,
  RETRIEVE = 5,
  PIR_RETRIEVE = 6,
  DROP_COLLECTION = 7,
};
} // namespace evd