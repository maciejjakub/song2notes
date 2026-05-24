declare namespace JSX {
  interface IntrinsicElements {
    'midi-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      'sound-font'?: string;
      loop?: boolean;
    };
    'midi-visualizer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      type?: 'piano-roll' | 'waterfall' | 'staff';
      ref?: React.Ref<HTMLElement>;
    };
  }
}
