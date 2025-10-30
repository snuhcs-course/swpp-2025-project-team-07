cmake_minimum_required(VERSION 3.14)

project(
  evd
  VERSION 1.0
  LANGUAGES CXX)

set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(BUILD_HEXL "Build HEXL from source" ON)
option(BUILD_PYTHON "Build Python bindings" OFF)
option(BUILD_NODE "Build Node.js bindings" OFF)

add_library(
  evd
  src/Client.cpp
  src/EVDClient.cpp
  src/EVDServer.cpp
  src/HEval.cpp
  src/PIRServer.cpp
  src/Random.cpp
  src/Server.cpp
  src/SecretKey.cpp)

target_include_directories(
  evd PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>)

include(FetchContent)

# ---------- HEXL ----------
if(BUILD_HEXL)
  FetchContent_Declare(
    hexl
    GIT_REPOSITORY https://github.com/intel/hexl.git
    GIT_TAG v1.2.5)
  set(HEXL_BENCHMARK OFF)
  set(HEXL_TESTING OFF)
  FetchContent_MakeAvailable(hexl)
else()
  find_package(hexl REQUIRED)
endif()

# ---------- OpenSSL / OpenMP / Threads ----------
find_package(OpenSSL REQUIRED)
find_package(OpenMP)
find_package(Threads REQUIRED)

# ---------- Boost (Beast는 헤더 전용) ----------
find_package(Boost 1.75 COMPONENTS system)

if(Boost_FOUND)
  target_include_directories(evd PUBLIC ${Boost_INCLUDE_DIRS})
  target_link_libraries(evd PUBLIC Boost::system)
else()
  message(
    STATUS
      "Boost::system not found. Building evd without Boost networking utilities; client/server functionality may be limited."
  )
endif()

target_link_libraries(evd
  PUBLIC
    OpenSSL::SSL
    OpenSSL::Crypto
    hexl
    Threads::Threads
)

target_include_directories(evd PUBLIC ${hexl_INCLUDE_DIRS})

if(OpenMP_CXX_FOUND)
  target_link_libraries(evd PUBLIC OpenMP::OpenMP_CXX)
else()
  target_compile_definitions(evd PUBLIC EVD_DISABLE_OPENMP)
  message(
    STATUS
      "OpenMP not found. Building evd without OpenMP support; performance may be reduced."
  )
endif()

# (선택) Windows에서 정적 링크 시 소켓 라이브러리 필요할 수 있음
if(WIN32)
  target_link_libraries(evd PUBLIC ws2_32 mswsock)
endif()

# ---------- Python Binding ----------
if(BUILD_PYTHON)
  find_package(Python3 COMPONENTS Interpreter Development REQUIRED)
  FetchContent_Declare(
    pybind11
    GIT_REPOSITORY https://github.com/pybind/pybind11.git
    GIT_TAG v2.11.1)
  FetchContent_MakeAvailable(pybind11)

  pybind11_add_module(evd_py python/bindings.cpp)
  target_link_libraries(evd_py PRIVATE evd)
  target_include_directories(evd_py PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  set_target_properties(evd_py PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_LIBRARY_OUTPUT_DIRECTORY}
    PREFIX "")
endif()

# ---------- Node.js Binding ----------
if(BUILD_NODE)
  if(NOT DEFINED CMAKE_JS_INC OR NOT DEFINED CMAKE_JS_LIB)
    message(
      FATAL_ERROR
        "CMAKE_JS_INC/CMAKE_JS_LIB not defined. Build via cmake-js or supply Node include/lib paths."
    )
  endif()

  execute_process(
    COMMAND ${CMAKE_COMMAND} -E env node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET)

  if(NOT NODE_ADDON_API_DIR)
    message(
      FATAL_ERROR
        "Failed to locate node-addon-api headers. Run `npm install node-addon-api` beforehand.")
  endif()

  string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")

  add_library(evd_node MODULE node/addon.cpp)
  set_target_properties(evd_node PROPERTIES PREFIX "" SUFFIX ".node")
  target_compile_features(evd_node PRIVATE cxx_std_20)
  target_compile_definitions(
    evd_node PRIVATE BUILDING_NODE_EXTENSION NAPI_CPP_EXCEPTIONS)
  target_include_directories(
    evd_node PRIVATE ${CMAKE_JS_INC} ${NODE_ADDON_API_DIR}
                     ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_link_libraries(evd_node PRIVATE ${CMAKE_JS_LIB} evd)
  if(APPLE)
    target_link_options(evd_node PRIVATE -undefined dynamic_lookup)
  endif()
endif()

# ---------- Install ----------
include(GNUInstallDirs)
install(
  TARGETS evd
  EXPORT evdTargets
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

install(
  EXPORT evdTargets
  FILE evdConfig.cmake
  NAMESPACE evd::
  DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/evd)

include(CMakePackageConfigHelpers)
write_basic_package_version_file(
  "${CMAKE_CURRENT_BINARY_DIR}/evdConfigVersion.cmake"
  VERSION ${PROJECT_VERSION}
  COMPATIBILITY AnyNewerVersion)

install(FILES "${CMAKE_CURRENT_BINARY_DIR}/evdConfigVersion.cmake"
        DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/evd)
