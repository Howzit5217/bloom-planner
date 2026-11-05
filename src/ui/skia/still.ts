import { Platform } from 'react-native';

/**
 * For a drawing that never moves: on the web it's drawn once into a plain image and gives its
 * graphics context back (a browser keeps only about sixteen of them alive).
 */
export const STILL = Platform.OS === 'web';
