## This is part of MSIWarp vendoring (i.e. bundling a built copy of their library with our library)
## It's hacky and should be removed as soon as there's a MSIWarp package available on PyPI

cmake_minimum_required(VERSION 3.1)

project(msiwarp VERSION "0.0.1")

# Set project properties.
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Set up compiler options based on platform.
if (CMAKE_COMPILER_IS_GNUCXX)
    set(CMAKE_CXX_FLAGS  "${CMAKE_CXX_FLAGS} -Wall -Wextra -Wpedantic")
endif()
if (MSVC)
    set(CMAKE_CXX_FLAGS  "${CMAKE_CXX_FLAGS} /W4")
endif()

# Build the msiwarp c++ library.
# ------------------------------
# Threads.
find_package(Threads REQUIRED)

# Build msiWarp library.
add_library(warplib
    "${CMAKE_CURRENT_SOURCE_DIR}/MSIWarp/src/lib/util/serialization.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/MSIWarp/src/lib/util/msi_triplet.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/MSIWarp/src/lib/warp/warp.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/MSIWarp/src/lib/warp/warp_util.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/MSIWarp/src/lib/warp/ransac.cpp"
    )
target_include_directories(warplib PUBLIC MSIWarp/src/lib)
target_link_libraries(warplib ${CMAKE_THREAD_LIBS_INIT})

# Build the python bindings.
# --------------------------
# PyBind.
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/MSIWarp/ext/pybind11" ${CMAKE_CURRENT_BINARY_DIR}/MSIWarp/pybind11)
pybind11_add_module(msiwarp MSIWarp/src/python-bindings/msiwarp/bindings.cpp)
target_link_libraries(msiwarp PRIVATE warplib)
