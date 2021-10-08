<template>
  <div class="abcRioButton abcRioButtonBlue">
    <div class="abcRioButtonContentWrapper">
      <div
        class="abcRioButtonIcon"
        style="padding:10px"
      >
        <div
          style="width:18px;height:18px;"
          class="abcRioButtonSvgImageWithFallback abcRioButtonIconImage abcRioButtonIconImage18"
        >
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            width="18px"
            height="18px"
            viewBox="0 0 48 48"
            class="abcRioButtonSvg"
          >
            <g>
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path
                fill="none"
                d="M0 0h48v48H0z"
              />
            </g>
          </svg>
        </div>
      </div>
      <span
        style="font-size:16px;line-height:38px;"
        class="abcRioButtonContents"
      ><slot /></span>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component } from 'vue-property-decorator'

  @Component
export default class GoogleButton extends Vue {
}
</script>

<style>
  .abcRioButton {
    border-radius: 1px;
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, .25);
    box-sizing: border-box;
    transition: background-color .218s, border-color .218s, box-shadow .218s;
    background-color: #fff;
    background-image: none;
    color: #262626;
    cursor: pointer;
    outline: none;
    overflow: hidden;
    position: relative;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
    width: 100%;
  }

  .abcRioButton:hover {
    box-shadow: 0 0 3px 3px rgba(66, 133, 244, .3);
  }

  .abcRioButtonBlue {
    background-color: #4285f4;
    border: none;
    color: #fff;
  }

  .abcRioButtonBlue:hover {
    background-color: #4285f4;
  }

  .abcRioButtonBlue:active {
    background-color: #3367d6;
  }

  .abcRioButtonLightBlue {
    background-color: #fff;
    color: #757575;
  }

  .abcRioButtonLightBlue:active {
    background-color: #eee;
    color: #6d6d6d;
  }

  .abcRioButtonIcon {
    float: left;
  }

  .abcRioButtonBlue .abcRioButtonIcon {
    background-color: #fff;
    border-radius: 1px;
  }

  .abcRioButtonSvg {
    display: block;
  }

  .abcRioButtonContents {
    font-family: Roboto, arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: .21px;
    margin-left: 6px;
    margin-right: 6px;
    vertical-align: top;
  }

  .abcRioButtonContentWrapper {
    height: 100%;
    width: 100%;
  }

  .abcRioButtonBlue .abcRioButtonContentWrapper {
    border: 1px solid transparent;
  }
</style>
