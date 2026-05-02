import { startMatrix } from './matrix/main';
import { bubbleGame } from './games/bubble/main';

const matrix = startMatrix();
bubbleGame.start(matrix);
